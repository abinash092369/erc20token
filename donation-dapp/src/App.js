import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import "./App.css";

// ✅ Replace with your deployed contract addresses
const DONATION_MANAGER_ADDRESS = "0x1ebC2a00a114441d608A8788AE46e5cDDB4b3E6f";
const CHARITY_WALLET_ADDRESS = "0x1743D7aD376877c2CEa32Ad885A3373cff0f197a";

// ✅ ABI for DonationManager
const DONATION_MANAGER_ABI = [
  "function donate(address token, uint256 amount, uint256 campaignId) external",
  "event DonationReceived(address indexed donor, address indexed token, uint256 amount, uint256 campaignId, uint256 timestamp)"
];

// ✅ ABI for CharityWallet
const CHARITY_WALLET_ABI = [
  "event ETHDonation(address indexed donor, uint256 amount, uint256 timestamp)"
];

function App() {
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [donations, setDonations] = useState([]);
  const [connected, setConnected] = useState(false);
  const [campaign, setCampaign] = useState("Clean Water Initiative");
  const [totalETH, setTotalETH] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [campaignTotals, setCampaignTotals] = useState({});

  // ✅ Campaign mapping
  const campaignIds = {
    "Clean Water Initiative": 1,
    "Zero Hunger Mission": 2,
    "Reforestation Project": 3,
    "Health & Relief Fund": 4,
    "Education for All": 5,
    "Animal Welfare Fund": 6
  };

  // 🔹 Initialize connection + load donations
  useEffect(() => {
    const init = async () => {
      if (!window.ethereum) return alert("Please install MetaMask");

      const [acc] = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(acc);
      setConnected(true);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const manager = new ethers.Contract(DONATION_MANAGER_ADDRESS, DONATION_MANAGER_ABI, provider);
      const wallet = new ethers.Contract(CHARITY_WALLET_ADDRESS, CHARITY_WALLET_ABI, provider);

      await loadPastDonations(manager, wallet);

      manager.removeAllListeners("DonationReceived");
      wallet.removeAllListeners("ETHDonation");

      manager.on("DonationReceived", async () => loadPastDonations(manager, wallet));
      wallet.on("ETHDonation", async () => loadPastDonations(manager, wallet));
    };

    init();
  }, []);

  // 🔹 Load all donations (ETH + Token)
  const loadPastDonations = async (manager, wallet) => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const currentBlock = await provider.getBlockNumber();
    const donationEvents = await manager.queryFilter("DonationReceived", currentBlock - 50000, "latest");
    const ethEvents = await wallet.queryFilter("ETHDonation", currentBlock - 50000, "latest");

    const all = [];
    let ethTotal = 0;
    let tokenTotal = 0;
    const perCampaign = {};

    for (let e of donationEvents.reverse()) {
      const { donor, token, amount, campaignId, timestamp } = e.args;
      const campaignName = Object.keys(campaignIds).find(key => campaignIds[key] === Number(campaignId)) || "Unknown";
      const value = parseFloat(ethers.formatEther(amount));
      tokenTotal += value;
      perCampaign[campaignName] = (perCampaign[campaignName] || 0) + value;
      all.push({
        donor,
        token,
        amount: value.toFixed(4),
        campaign: campaignName,
        time: new Date(Number(timestamp) * 1000).toLocaleString()
      });
    }

    for (let e of ethEvents.reverse()) {
      const { donor, amount, timestamp } = e.args;
      const value = parseFloat(ethers.formatEther(amount));
      ethTotal += value;
      perCampaign["General ETH Donation"] = (perCampaign["General ETH Donation"] || 0) + value;
      all.push({
        donor,
        token: "ETH",
        amount: value.toFixed(4),
        campaign: "General ETH Donation",
        time: new Date(Number(timestamp) * 1000).toLocaleString()
      });
    }

    all.sort((a, b) => new Date(b.time) - new Date(a.time));

    setDonations(all.slice(0, 5));
    setTotalETH(ethTotal.toFixed(4));
    setTotalTokens(tokenTotal.toFixed(4));
    setCampaignTotals(perCampaign);
  };

  // ✅ Donate ETH
  const donateETH = async () => {
    if (!amount) return alert("Enter amount");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const tx = await signer.sendTransaction({
        to: CHARITY_WALLET_ADDRESS,
        value: ethers.parseEther(amount)
      });
      await tx.wait();
      alert("✅ ETH Donation successful!");
      setAmount("");
    } catch (err) {
      console.error(err);
      alert("❌ Transaction failed");
    }
  };

  // ✅ Donate Tokens
  const donateTokens = async () => {
    if (!tokenAddress.trim()) return alert("Enter a valid ERC-20 token address.");
    if (!amount) return alert("Enter amount");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const tokenABI = [
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function decimals() public view returns (uint8)"
      ];
      const tokenContract = new ethers.Contract(tokenAddress, tokenABI, signer);
      const decimals = await tokenContract.decimals();
      const parsedAmount = ethers.parseUnits(amount, decimals);
      const tx1 = await tokenContract.approve(DONATION_MANAGER_ADDRESS, parsedAmount);
      await tx1.wait();
      const manager = new ethers.Contract(DONATION_MANAGER_ADDRESS, DONATION_MANAGER_ABI, signer);
      const campaignId = campaignIds[campaign] || 0;
      const tx2 = await manager.donate(tokenAddress, parsedAmount, campaignId);
      await tx2.wait();
      alert("✅ Token donation successful!");
      setAmount("");
    } catch (err) {
      console.error(err);
      alert("❌ Token donation failed");
    }
  };

  return (
    <div className="App">
      <h1>🌍 ERC-20 Token Donation Platform</h1>

      <p style={{ color: connected ? "limegreen" : "gray", fontWeight: 600 }}>
        {connected ? "🟢 Connected" : "🔴 Not Connected"}
      </p>

      {/* Donation Form */}
      <div className="donation-box">
        <select value={campaign} onChange={e => setCampaign(e.target.value)}>
          {Object.keys(campaignIds).map(name => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="ERC-20 Token Address (optional)"
          value={tokenAddress}
          onChange={e => setTokenAddress(e.target.value)}
        />
        <input
          type="number"
          placeholder="Amount"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
        <div>
          <button onClick={donateTokens}>Donate Tokens</button>
          <button onClick={donateETH}>Donate ETH</button>
        </div>
      </div>

      <hr />

      {/* ✅ Summary Boxes */}
      <div className="summary-section">
        <div className="summary-box">
          <h3>💰 Total Donations</h3>
          <p><strong>ETH Donated:</strong> {totalETH} ETH</p>
          <p><strong>Token Donations:</strong> {totalTokens} Tokens</p>
          <p><strong>Campaigns Supported:</strong> {Object.keys(campaignTotals).length}</p>
        </div>

        <div className="summary-box">
          <h3>📊 Donations per Campaign</h3>
          {Object.keys(campaignTotals).length === 0 ? (
            <p>No campaign donations yet.</p>
          ) : (
            <ul>
              {Object.entries(campaignTotals).map(([name, amt]) => (
                <li key={name}>{name}: {amt.toFixed(4)} ETH</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <hr />

      {/* ✅ Recent Donations */}
      <div className="stats">
        <h3>🕒 Recent Donations</h3>
        {donations.length === 0 ? (
          <p>No donations yet.</p>
        ) : (
          donations.map((d, i) => (
            <div className="donation-entry" key={i}>
              <strong>{d.campaign}</strong><br />
              From: {d.donor.slice(0, 6)}...{d.donor.slice(-4)}<br />
              Amount: {d.amount} {d.token}<br />
              Token: {d.token}<br />
              Time: {d.time}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;
