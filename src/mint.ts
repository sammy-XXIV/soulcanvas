import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xLayer } from "viem/chains";

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

const CONTRACT_ABI = parseAbi([
  "function mint(address to, string uri) external returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

const account = privateKeyToAccount(requireEnv("MINTER_PRIVATE_KEY") as `0x${string}`);
const transport = http(process.env.XLAYER_RPC_URL ?? "https://rpc.xlayer.tech");

const publicClient = createPublicClient({ chain: xLayer, transport });
const walletClient = createWalletClient({ account, chain: xLayer, transport });

export const CONTRACT_ADDRESS = requireEnv("SOULBOUND_CONTRACT_ADDRESS") as `0x${string}`;

/** Mint a soulbound memory NFT to `to`, waits for on-chain confirmation, returns the tokenId + tx hash. */
export async function mintMemory(to: `0x${string}`, tokenURI: string): Promise<{ tokenId: bigint; txHash: `0x${string}` }> {
  const txHash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "mint",
    args: [to, tokenURI],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  const transferLog = receipt.logs.find(
    (log) => log.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()
  );
  if (!transferLog || transferLog.topics.length < 4) {
    throw new Error("mint succeeded but Transfer event not found in receipt logs");
  }
  const tokenId = BigInt(transferLog.topics[3]!);

  return { tokenId, txHash };
}
