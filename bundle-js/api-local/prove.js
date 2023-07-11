// usage: node prove.js [--inputgen/pretest] <blocknum/blockhash> <state> -> wasm input
// TODO: add -o --outfile <file> under inputgen mode
import { program } from "commander";
import {
  formatVarLenInput,
  genStreamAndMatchedEventOffsets,
} from "../common/api_helper.js";
import { loadConfig } from "../common/config.js";
import { providers } from "ethers";
import { getRawReceipts } from "../common/ethers_helper.js";
import { rlpDecodeAndEventFilter } from "../common/api_helper.js";
import {
  fromHexString,
  toHexString,
  trimPrefix,
  logDivider,
} from "../common/utils.js";
import { zkmain, setupZKWasmMock } from "../common/bundle_local.js";
import { ZKWASMMock } from "../common/zkwasm_mock.js";
import { constants } from "../../constants.js";

program.version("1.0.0");

program
  .argument("<block id>", "Block number (or block hash) as runtime context")
  .argument("<expected state>", "State output of the zkgraph execution")
  .option("-i, --inputgen", "Generate input")
  .option("-p, --pretest", "Run in pretest Mode");

program.parse(process.argv);

const args = program.args;
const options = program.opts();

// Read block id
const blockid = args[0].length >= 64 ? args[0] : parseInt(args[0]); //17633573
let expectedStateStr = args[1];
expectedStateStr = trimPrefix(expectedStateStr, "0x");

// Load config
const [source_address, source_esigs] = loadConfig("src/zkgraph.yaml");

const provider = new providers.JsonRpcProvider(constants.JsonRpcProviderUrl);

// Fetch raw receipts
let rawreceiptList = await getRawReceipts(provider, blockid);
// rawreceiptList = rawreceiptList.slice(25, 26);

// RLP Decode and Filter
const [filteredRawReceiptList, filteredEventList] = rlpDecodeAndEventFilter(
  rawreceiptList,
  fromHexString(source_address),
  source_esigs.map((esig) => fromHexString(esig)),
);

// Gen Offsets
let [rawReceipts, matchedEventOffsets] = genStreamAndMatchedEventOffsets(
  filteredRawReceiptList,
  filteredEventList,
);
matchedEventOffsets = Uint32Array.from(matchedEventOffsets);

console.log(
  "[*]",
  rawreceiptList.length,
  rawreceiptList.length > 1
    ? "receipts fetched from block"
    : "receipt fetched from block",
  blockid,
);
console.log(
  "[*]",
  matchedEventOffsets.length / 7,
  matchedEventOffsets.length / 7 > 1 ? "events matched" : "event matched",
);
for (let i in filteredEventList) {
  for (let j in filteredEventList[i]) {
    filteredEventList[i][j].prettyPrint(
      "\tTx[" + i + "]Event[" + j + "]",
      false,
    );
  }
}

const privateInputStr = formatVarLenInput([
  toHexString(rawReceipts),
  toHexString(new Uint8Array(matchedEventOffsets.buffer)),
]);

const publicInputStr = formatVarLenInput([expectedStateStr]);

switch (options.inputgen || options.pretest) {
  // Input generation mode
  case options.inputgen:
    // Log script name
    console.log(">> PROVE: INPUT GENERATION MODE", "\n");
    console.log("[+] ZKGRAPH STATE OUTPUT:", expectedStateStr, "\n");
    console.log("[+] PRIVATE INPUT FOR ZKWASM:", "\n" + privateInputStr, "\n");
    console.log("[+] PUBLIC INPUT FOR ZKWASM:", "\n" + publicInputStr, "\n");
    break;

  // Pretest mode
  case options.pretest:
    // Log script name
    console.log(">> PROVE: PRETEST MODE", "\n");
    const mock = new ZKWASMMock();
    mock.set_private_input(privateInputStr);
    mock.set_public_input(publicInputStr);
    setupZKWasmMock(mock);
    zkmain();
    console.log("[+] ZKWASM MOCK EXECUTION SUCCESS!", "\n");
    break;
}

logDivider();

process.exit(0);
