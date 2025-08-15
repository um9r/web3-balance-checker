# Web3 Wallet Token Tracker

A minimal static web app to connect an injected Web3 wallet (e.g., MetaMask) and view ETH + ERC‑20 token balances with USD conversion and multi‑token tracking.

Features

- Connect / Disconnect wallet
- ETH and ERC‑20 token balances
- Add / remove ERC‑20 tokens by contract address (persisted in localStorage)
- USD fiat conversion using CoinGecko (simple mapping for common symbols)
- Network detection and switch prompt (Mainnet recommended)
- Refresh button and optional auto‑refresh intervals
- Loading skeletons and a spinner while fetching balances
- Copy address and explorer link per network
- Shortened address display with attempted ENS lookup
- Light / Dark theme toggle

Files

- `index.html` — main UI and styling
- `script.js` — app logic (Web3 interactions, tokens, prices, UI behavior)
- `README.md` — this file

Quick start

1. Open the project folder in a code editor (VS Code recommended).
2. Serve the folder using a static server (recommended) or open `index.html` in a browser.
   - Using VS Code Live Server extension is easiest.
   - Or run a simple HTTP server (e.g., Python: `python -m http.server`) from the folder.
3. Open the page, click "Connect Wallet", and authorize your wallet.

Notes & limitations

- This is a client‑side demo that uses an injected provider (window.ethereum). It does not hold keys or send transactions by itself.
- CoinGecko requests are unauthenticated; avoid excessive requests. Price results are cached briefly.
- ENS lookup is attempted via the provider/web3 and may not resolve in all environments.
- Token contract calls are wrapped safely; tokens that do not implement `decimals` or `symbol` will fall back to defaults.

Security & privacy

- No private keys are stored. Token list is saved locally in your browser's localStorage (`saved_tokens_v1`).
- Do not paste private keys or seed phrases into this app.

Extending the project

- Add WalletConnect or mobile wallet support.
- Improve CoinGecko mapping or use a token registry for symbol→id mapping.
- Replace Web3.js with ethers.js for a smaller, more modern API.
- Add transactions (send ETH / tokens) with gas estimation and confirmations.

Troubleshooting

- If balances show `--` or connection fails: ensure MetaMask (or another injected wallet) is installed and unlocked.
- If token balances are incorrect: verify the token contract address and network.

License

- This project is provided as-is for experimentation and learning.

If you want, I can add a small dev script (npm) and ESLint/Prettier config, or convert the styles into a separate CSS file.
