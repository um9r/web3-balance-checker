const connectButton = document.getElementById("connectButton");
const accountDisplay = document.getElementById("account");
const ethBalanceDisplay = document.getElementById("ethBalance");
const tokenBalanceDisplay = document.getElementById("tokenBalance");

// New UI elements for multi-token support
const tokensListContainer = document.getElementById("tokensList");
const tokenAddressInput = document.getElementById("tokenAddressInput");
const addTokenButton = document.getElementById("addTokenButton");

// New UI elements for network, refresh and copy
const networkDisplay = document.getElementById("networkDisplay");
const networkWarning = document.getElementById("networkWarning");
const switchNetworkContainer = document.getElementById(
  "switchNetworkContainer"
);
const spinnerEl = document.getElementById("spinner");
const refreshBtn = document.getElementById("refreshBtn");
const autoRefreshSelect = document.getElementById("autoRefreshInterval");
const copyAddressBtn = document.getElementById("copyAddressBtn");
const explorerLink = document.getElementById("explorerLink");

// ERC-20 Token Info (default USDT on Ethereum Mainnet)
const defaultTokens = [
  { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", note: "USDT" },
];

const erc20MinimalABI = [
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
let chainChangedHandler = null;
let currentChainId = null; // numeric
let autoRefreshTimer = null;

// Tokens persisted in localStorage under this key
const TOKENS_KEY = "saved_tokens_v1";
let savedTokens = loadSavedTokens();

function loadSavedTokens() {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    if (!raw) return defaultTokens.slice();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0)
      return defaultTokens.slice();
    return parsed;
  } catch (e) {
    return defaultTokens.slice();
  }
}

function persistTokens() {
  try {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(savedTokens));
  } catch (e) {}
}

// Network helpers
function normalizeChainId(chainId) {
  if (!chainId) return null;
  if (typeof chainId === "string" && chainId.startsWith("0x"))
    return parseInt(chainId, 16);
  return Number(chainId);
}

function getChainInfo(chainId) {
  const id = normalizeChainId(chainId);
  const map = {
    1: {
      name: "Ethereum Mainnet",
      explorer: "https://etherscan.io",
      supported: true,
    },
    5: {
      name: "Goerli (deprecated)",
      explorer: "https://goerli.etherscan.io",
      supported: false,
    },
    11155111: {
      name: "Sepolia",
      explorer: "https://sepolia.etherscan.io",
      supported: false,
    },
    137: {
      name: "Polygon Mainnet",
      explorer: "https://polygonscan.com",
      supported: false,
    },
  };
  return map[id] || { name: `Chain ${id}`, explorer: "", supported: false };
}

async function updateNetworkInfo(rawChainId) {
  const id = normalizeChainId(rawChainId);
  currentChainId = id;
  const info = getChainInfo(id);
  if (networkDisplay) networkDisplay.textContent = `Network: ${info.name}`;
  if (!info.supported) {
    if (networkWarning) networkWarning.innerHTML = `Unsupported network`;
    if (switchNetworkContainer) switchNetworkContainer.innerHTML = "";
    if (switchNetworkContainer) {
      const btn = document.createElement("button");
      btn.id = "switchNetworkBtn";
      btn.textContent = "Switch to Mainnet";
      btn.addEventListener("click", async () => {
        await requestSwitchToMainnet();
      });
      switchNetworkContainer.appendChild(btn);
    }
  } else {
    if (networkWarning) networkWarning.innerHTML = "";
    if (switchNetworkContainer) switchNetworkContainer.innerHTML = "";
  }

  // update explorer link base
  if (explorerLink) {
    if (info && info.explorer)
      explorerLink.href = info.explorer + "/address/" + (userAccount || "");
    else explorerLink.href = "#";
  }
}

async function requestSwitchToMainnet() {
  if (!window.ethereum) return alert("No injected wallet");
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1" }],
    });
  } catch (err) {
    // 4902: chain not added
    console.error("Failed to switch network:", err);
    alert("Please switch your wallet network to Ethereum Mainnet");
  }
}

// Update UI helpers
async function displayAccount(account) {
  if (!account) return updateUIDisconnected();
  // try ENS lookup
  let ensName;
  if (web3 && web3.eth && web3.eth.ens) {
    try {
      // web3.eth.ens.getName may not exist on all versions; use safeCall
      const res = await safeCall(() => web3.eth.ens.getName(account));
      // some versions return object with name property
      ensName =
        res && res.name ? res.name : typeof res === "string" ? res : undefined;
    } catch (e) {
      ensName = undefined;
    }
  }

  const short = shortenAddress(account);
  const label = ensName ? `${ensName} (${short})` : short;
  accountDisplay.textContent = `Connected: ${label}`;
  accountDisplay.title = account;

  // explorer link
  if (explorerLink) {
    const info = getChainInfo(currentChainId);
    explorerLink.href = info.explorer
      ? `${info.explorer}/address/${account}`
      : "#";
    explorerLink.textContent = "Explorer";
  }
}

function updateUIConnected(account) {
  // keep button text
  connectButton.textContent = "Disconnect Wallet";
  displayAccount(account);
}

function updateUIDisconnected() {
  accountDisplay.textContent = "Not connected";
  accountDisplay.title = "";
  ethBalanceDisplay.textContent = "ETH Balance: --";
  tokenBalanceDisplay.textContent = "USDT Balance: --";
  connectButton.textContent = "Connect Wallet";
  if (explorerLink) {
    explorerLink.href = "#";
    explorerLink.textContent = "Explorer";
  }
  if (copyAddressBtn) copyAddressBtn.disabled = true;
  // Clear dynamic tokens UI
  renderSavedTokens();
  clearAutoRefresh();
}

// Render tokens list UI
function renderSavedTokens() {
  if (!tokensListContainer) return;
  tokensListContainer.innerHTML = "";

  savedTokens.forEach((t, idx) => {
    const wrapper = document.createElement("div");
    wrapper.className = "info-card";

    const icon = document.createElement("div");
    icon.className = "info-icon usdt";
    icon.style.flexShrink = "0";
    icon.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="rgba(255,255,255,0.18)"/><path d="M9 12h14v2H9zM9 18h10v2H9z" fill="white"/></svg>';

    const body = document.createElement("div");
    body.className = "info-body";

    const label = document.createElement("div");
    label.className = "info-label";
    label.textContent = t.note || shortenAddress(t.address);

    const value = document.createElement("div");
    value.className = "info-value";
    value.textContent = `${t.note || "Token"}: --`;
    value.dataset.address = t.address;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.style.marginLeft = "12px";
    removeBtn.style.padding = "6px 8px";
    removeBtn.style.borderRadius = "8px";
    removeBtn.style.border = "none";
    removeBtn.style.cursor = "pointer";
    removeBtn.addEventListener("click", () => {
      savedTokens.splice(idx, 1);
      persistTokens();
      renderSavedTokens();
      // Clear displayed balance
      const el = document.querySelector(`[data-address='${t.address}']`);
      if (el) el.textContent = "";
    });

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.appendChild(removeBtn);

    body.appendChild(label);
    body.appendChild(value);

    wrapper.appendChild(icon);
    wrapper.appendChild(body);
    wrapper.appendChild(right);

    tokensListContainer.appendChild(wrapper);
  });
}

function shortenAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// Loading helpers
function showSpinner() {
  if (spinnerEl) spinnerEl.classList.add("visible");
}
function hideSpinner() {
  if (spinnerEl) spinnerEl.classList.remove("visible");
}
function setLoadingOnBalances(on) {
  [ethBalanceDisplay, tokenBalanceDisplay].forEach((el) => {
    if (!el) return;
    if (on) el.classList.add("skeleton");
    else el.classList.remove("skeleton");
  });
  // dynamic token elements
  if (tokensListContainer) {
    const els = tokensListContainer.querySelectorAll("[data-address]");
    els.forEach((el) => {
      if (on) el.classList.add("skeleton");
      else el.classList.remove("skeleton");
    });
  }
}

// Fetch balances (assumes web3 is initialized)
async function fetchBalances(account) {
  if (!web3 || !account) return;

  try {
    showSpinner();
    setLoadingOnBalances(true);

    // ETH Balance
    const balanceWei = await web3.eth.getBalance(account);
    const balanceEth = web3.utils.fromWei(balanceWei, "ether");
    ethBalanceDisplay.textContent = `ETH Balance: ${parseFloat(
      balanceEth
    ).toFixed(4)} ETH`;

    // Fetch ETH price (CoinGecko)
    const ethPrice = await fetchPrice("ethereum");
    if (ethPrice) {
      ethBalanceDisplay.textContent += ` (${(
        parseFloat(balanceEth) * ethPrice
      ).toFixed(2)} USD)`;
    }

    // ERC-20 Token Balance (first default/legacy token displayed in static area)
    const mainToken = savedTokens[0];
    if (mainToken) {
      const tokenContract = new web3.eth.Contract(
        erc20MinimalABI,
        mainToken.address
      );
      const [decimals, symbol, raw] = await Promise.all([
        safeCall(() => tokenContract.methods.decimals().call()),
        safeCall(() => tokenContract.methods.symbol().call()),
        safeCall(() => tokenContract.methods.balanceOf(account).call()),
      ]);

      const safeDecimals =
        typeof decimals === "undefined" || decimals === null
          ? 18
          : Number(decimals);
      const safeSymbol = symbol || "TOKEN";
      const tokenFormattedBalance = raw ? raw / Math.pow(10, safeDecimals) : 0;

      // Try fetching price by symbol mapping to CoinGecko (simple mapping for common tokens)
      const cgId = mapSymbolToCoinGeckoId(safeSymbol);
      const price = cgId ? await fetchPrice(cgId) : null;

      tokenBalanceDisplay.textContent =
        `${safeSymbol} Balance: ${tokenFormattedBalance.toFixed(
          4
        )} ${safeSymbol}` +
        (price ? ` (${(tokenFormattedBalance * price).toFixed(2)} USD)` : "");
    }

    // Dynamic saved tokens (beyond main token)
    await Promise.all(
      savedTokens.map(async (t) => {
        try {
          const contract = new web3.eth.Contract(erc20MinimalABI, t.address);
          const [decimals, symbol, raw] = await Promise.all([
            safeCall(() => contract.methods.decimals().call()),
            safeCall(() => contract.methods.symbol().call()),
            safeCall(() => contract.methods.balanceOf(account).call()),
          ]);
          const safeDecimals =
            typeof decimals === "undefined" || decimals === null
              ? 18
              : Number(decimals);
          const safeSymbol = symbol || t.note || shortenAddress(t.address);
          const tokenFormattedBalance = raw
            ? raw / Math.pow(10, safeDecimals)
            : 0;

          // price lookup
          const cgId = mapSymbolToCoinGeckoId(safeSymbol);
          const price = cgId ? await fetchPrice(cgId) : null;

          // update UI element
          const el = document.querySelector(`[data-address='${t.address}']`);
          if (el)
            el.textContent =
              `${safeSymbol} Balance: ${tokenFormattedBalance.toFixed(4)}` +
              (price
                ? ` (${(tokenFormattedBalance * price).toFixed(2)} USD)`
                : "");
        } catch (e) {
          console.error("Error fetching token", t.address, e);
        }
      })
    );
  } catch (err) {
    console.error("Error fetching balances:", err);
  } finally {
    hideSpinner();
    setLoadingOnBalances(false);
  }
}

// Safe wrapper for contract calls to avoid app crash if a token doesn't implement a method
async function safeCall(fn) {
  try {
    return await fn();
  } catch (e) {
    return undefined;
  }
}

// Simple CoinGecko price fetch (caches results briefly)
const priceCache = {};
async function fetchPrice(coingeckoId) {
  if (!coingeckoId) return null;
  const now = Date.now();
  if (priceCache[coingeckoId] && now - priceCache[coingeckoId].ts < 60000)
    return priceCache[coingeckoId].price;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
        coingeckoId
      )}&vs_currencies=usd`
    );
    const j = await res.json();
    if (j && j[coingeckoId] && j[coingeckoId].usd) {
      priceCache[coingeckoId] = { price: j[coingeckoId].usd, ts: now };
      return j[coingeckoId].usd;
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

// Very small mapping for common tokens; can be extended
function mapSymbolToCoinGeckoId(symbol) {
  const map = {
    ETH: "ethereum",
    WETH: "weth",
    USDT: "tether",
    USDC: "usd-coin",
    DAI: "dai",
  };
  return map[symbol?.toUpperCase()] || null;
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

    // network info
    try {
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      await updateNetworkInfo(chainId);
    } catch (e) {}

    if (userAccount) {
      updateUIConnected(userAccount);
      if (copyAddressBtn) copyAddressBtn.disabled = false;
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

      // Register chainChanged handler
      if (!chainChangedHandler) {
        chainChangedHandler = (chainId) => {
          updateNetworkInfo(chainId);
          // refetch balances when chain changes
          if (userAccount) fetchBalances(userAccount);
        };
        try {
          window.ethereum.on("chainChanged", chainChangedHandler);
        } catch (e) {}
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
  if (
    chainChangedHandler &&
    window.ethereum &&
    window.ethereum.removeListener
  ) {
    try {
      window.ethereum.removeListener("chainChanged", chainChangedHandler);
    } catch (e) {}
    chainChangedHandler = null;
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

// Add token button
if (addTokenButton) {
  addTokenButton.addEventListener("click", () => {
    const val = (tokenAddressInput.value || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(val)) {
      alert("Please enter a valid ERC-20 contract address (0x...)");
      return;
    }
    // prevent duplicates
    if (
      savedTokens.find((s) => s.address.toLowerCase() === val.toLowerCase())
    ) {
      alert("Token already added");
      return;
    }
    savedTokens.push({ address: val, note: "" });
    persistTokens();
    renderSavedTokens();
    tokenAddressInput.value = "";
    if (userAccount) fetchBalances(userAccount);
  });
}

// Refresh and auto-refresh
if (refreshBtn)
  refreshBtn.addEventListener("click", () => {
    if (userAccount) fetchBalances(userAccount);
  });
if (autoRefreshSelect)
  autoRefreshSelect.addEventListener("change", () => {
    const v = Number(autoRefreshSelect.value);
    clearAutoRefresh();
    if (v > 0 && userAccount)
      autoRefreshTimer = setInterval(() => {
        fetchBalances(userAccount);
      }, v);
  });
function clearAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

// Copy address
if (copyAddressBtn)
  copyAddressBtn.addEventListener("click", async () => {
    if (!userAccount) return;
    try {
      await navigator.clipboard.writeText(userAccount);
      copyAddressBtn.textContent = "Copied";
      setTimeout(() => {
        if (copyAddressBtn) copyAddressBtn.textContent = "Copy";
      }, 1200);
    } catch (e) {
      alert("Copy failed");
    }
  });

// On load: render tokens and check if already connected (wallet previously authorized)
renderSavedTokens();
(async function init() {
  if (typeof window.ethereum !== "undefined") {
    try {
      web3 = new Web3(window.ethereum);
      const accounts = await window.ethereum.request({
        method: "eth_accounts",
      });
      try {
        const chainId = await window.ethereum.request({
          method: "eth_chainId",
        });
        await updateNetworkInfo(chainId);
      } catch (e) {}
      if (accounts && accounts.length > 0) {
        userAccount = accounts[0];
        updateUIConnected(userAccount);
        if (copyAddressBtn) copyAddressBtn.disabled = false;
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

        if (!chainChangedHandler) {
          chainChangedHandler = (chainId) => {
            updateNetworkInfo(chainId);
            if (userAccount) fetchBalances(userAccount);
          };
          try {
            window.ethereum.on("chainChanged", chainChangedHandler);
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
