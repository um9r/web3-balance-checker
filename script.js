const connectButton = document.getElementById("connectButton");
const accountDisplay = document.getElementById("account");
const ethBalanceDisplay = document.getElementById("ethBalance");
const tokenBalanceDisplay = document.getElementById("tokenBalance");

// ERC-20 Token Info (USDT on Ethereum Mainnet)
const tokenAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT contract
const tokenABI = [
  // balanceOf
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  // decimals
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
  // name
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
  // symbol
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
];

let web3;
let userAccount = null;
let accountsChangedHandler = null;

// Update UI helpers
function updateUIConnected(account) {
  accountDisplay.textContent = `Connected: ${account}`;
  connectButton.textContent = "Disconnect Wallet";
}

function updateUIDisconnected() {
  accountDisplay.textContent = "Not connected";
  ethBalanceDisplay.textContent = "ETH Balance: --";
  tokenBalanceDisplay.textContent = "USDT Balance: --";
  connectButton.textContent = "Connect Wallet";
}

// Fetch balances (assumes web3 is initialized)
async function fetchBalances(account) {
  if (!web3 || !account) return;

  try {
    // ETH Balance
    const balanceWei = await web3.eth.getBalance(account);
    const balanceEth = web3.utils.fromWei(balanceWei, "ether");
    ethBalanceDisplay.textContent = `ETH Balance: ${parseFloat(
      balanceEth
    ).toFixed(4)} ETH`;

    // ERC-20 Token Balance
    const tokenContract = new web3.eth.Contract(tokenABI, tokenAddress);
    const tokenDecimals = await tokenContract.methods.decimals().call();
    const tokenSymbol = await tokenContract.methods.symbol().call();
    const tokenRawBalance = await tokenContract.methods
      .balanceOf(account)
      .call();
    const tokenFormattedBalance = tokenRawBalance / Math.pow(10, tokenDecimals);
    tokenBalanceDisplay.textContent = `${tokenSymbol} Balance: ${tokenFormattedBalance.toFixed(
      2
    )} ${tokenSymbol}`;
  } catch (err) {
    console.error("Error fetching balances:", err);
  }
}

// Connect wallet
async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    alert("Please install MetaMask to use this app.");
    return;
  }

  try {
    // Request accounts
    await window.ethereum.request({ method: "eth_requestAccounts" });
    web3 = new Web3(window.ethereum);

    const accounts = await web3.eth.getAccounts();
    userAccount = accounts[0] || null;

    if (userAccount) {
      updateUIConnected(userAccount);
      await fetchBalances(userAccount);

      // Register accountsChanged handler if not already
      if (!accountsChangedHandler) {
        accountsChangedHandler = function (accounts) {
          if (!accounts || accounts.length === 0) {
            // Wallet locked/disconnected in the provider
            disconnectWallet();
          } else {
            userAccount = accounts[0];
            updateUIConnected(userAccount);
            fetchBalances(userAccount);
          }
        };
        try {
          window.ethereum.on("accountsChanged", accountsChangedHandler);
        } catch (e) {
          // Some providers may not support .on
        }
      }
    } else {
      updateUIDisconnected();
    }
  } catch (error) {
    console.error("Error connecting wallet or fetching balances:", error);
    accountDisplay.textContent = "Failed to connect wallet or fetch balances!";
  }
}

// Disconnect wallet (clears app state/UI only)
function disconnectWallet() {
  // Remove listener
  if (
    accountsChangedHandler &&
    window.ethereum &&
    window.ethereum.removeListener
  ) {
    try {
      window.ethereum.removeListener("accountsChanged", accountsChangedHandler);
    } catch (e) {}
    accountsChangedHandler = null;
  }

  // Clear state
  userAccount = null;
  web3 = null;
  updateUIDisconnected();
}

// Button toggles connect / disconnect
connectButton.addEventListener("click", async () => {
  if (userAccount) {
    disconnectWallet();
  } else {
    await connectWallet();
  }
});

// On load: check if already connected (wallet previously authorized)
(async function init() {
  if (typeof window.ethereum !== "undefined") {
    try {
      web3 = new Web3(window.ethereum);
      const accounts = await window.ethereum.request({
        method: "eth_accounts",
      });
      if (accounts && accounts.length > 0) {
        userAccount = accounts[0];
        updateUIConnected(userAccount);
        await fetchBalances(userAccount);

        // register handler
        if (!accountsChangedHandler) {
          accountsChangedHandler = function (accounts) {
            if (!accounts || accounts.length === 0) {
              disconnectWallet();
            } else {
              userAccount = accounts[0];
              updateUIConnected(userAccount);
              fetchBalances(userAccount);
            }
          };
          try {
            window.ethereum.on("accountsChanged", accountsChangedHandler);
          } catch (e) {}
        }
      } else {
        updateUIDisconnected();
      }
    } catch (err) {
      console.error("Error during init:", err);
      updateUIDisconnected();
    }
  } else {
    updateUIDisconnected();
  }
})();
