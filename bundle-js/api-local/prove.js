// usage: node prove.js [--inputgen/pretest] <blocknum/blockhash> <state> -> wasm input
//TODO: add -o --outfile <file> under inputgen mode
import  { program } from "commander";
import { formatVarLenInput, genStreamAndMatchedEventOffsets } from "../common/apihelper.js";
import { loadConfig } from "../common/config.js";
import { providers } from "ethers";
import { getRawReceipts } from "../common/ethers_helper.js";
import { rlpDecodeAndEventFilter } from "../common/apihelper.js";
import { fromHexString, toHexString, trimPrefix } from "../common/utils.js";
import { asmain, zkmain, setupZKWasmMock } from "../common/bundle_local.js";

program.version("1.0.0");

program.argument("<block id>", "Block number (or block hash) as runtime context")
    .argument("<expected state>", "State output of the zkgraph execution")
    .option("-i, --inputgen", "Generate input")
    .option('-p, --pretest', 'Run in pretest Mode');
  
program.parse(process.argv);

const args = program.args;
const options = program.opts();

// Read block id
var blockid = args[0].length >= 64 ? args[0] : parseInt(args[0]); //17633573
var expectedStateStr = args[1]
var expectedStateStr = trimPrefix(expectedStateStr, '0x')

// if (options.block) {
//     blockid = Number.isFinite(options.block) ? options.block : parseInt(options.block)
// //   console.log(`Port number: ${options.port}`);
// }

// Load config
var [source_address, source_esigs] = loadConfig('src/zkgraph.yaml')
console.log('[*] source contract address:', source_address)
console.log('[*] source events signatures:', source_esigs)

const provider = new providers.JsonRpcProvider(
    "https://eth-mainnet.nodereal.io/v1/1659dfb40aa24bbb8153a677b98064d7"
  );

// const block = await provider.getBlock(blockid);
// console.log(block.hash, block.number)

// Fetch raw receipts
var rawreceiptList = await getRawReceipts(provider, blockid);
var rawreceiptList = rawreceiptList.slice(25, 26)

// RLP Decode and Filter
var eventList = rlpDecodeAndEventFilter(
    rawreceiptList,
    fromHexString(source_address),
    source_esigs.map(esig => fromHexString(esig))
);

// Gen Offsets
var [rawReceipts, matchedEventOffsets] = genStreamAndMatchedEventOffsets(rawreceiptList, eventList)
matchedEventOffsets = Uint32Array.from(matchedEventOffsets)
// Log
console.log('[*] fetched', rawreceiptList.length, 'receipts, from block', blockid)
console.log('[*] matched', matchedEventOffsets.length / 7, 'events')
// console.log('[*] matched', matched_event_offsets.length / 7, 'events, with source_addr = \'' + source_address + '\' source_esigs =', source_esigs)
for (var i in eventList){
    for (var j in eventList[i]){
        eventList[i][j].prettyPrint('    Tx['+i+']Ev['+j+']', false)
    }
}

// Inputs:
// const expectedState = asmain(rawReceipts, matchedEventOffsets);
// const expectedStateStr = toHexString(expectedState)

// console.log('expectedStateStr:',expectedStateStr)
const privateInputStr = 
formatVarLenInput([
  toHexString(rawReceipts),
  toHexString(new Uint8Array(matchedEventOffsets.buffer)),
])

const publicInputStr = formatVarLenInput([expectedStateStr])

if (options.inputgen) {
    console.log("Input generation mode");
//   console.log(`Port number: ${options.port}`);

    // Print expected state and inputs for zkwasm
    console.log("ZKGRAPH STATE OUTPUT:");
    console.log(expectedStateStr, "\n");

    // Print inputs for zkwasm
    console.log("PRIVATE INPUT FOR ZKWASM:");
    console.log(privateInputStr, "\n");

    console.log("PUBLIC INPUT FOR ZKWASM:");
    console.log(publicInputStr, "\n");
    process.exit(0)

}

import { ZKWASMMock } from "../common/zkwasm_mock.js";

if (options.pretest) {
    var mock = new ZKWASMMock();
    mock.set_private_input(privateInputStr);
    mock.set_public_input(publicInputStr);
    // mock.privateMem.print('private input cache')
    setupZKWasmMock(mock);

    // console.log(rawreceipts)
    // console.log(matched_event_offset, matched_event_offset.length)
    zkmain();

    console.log("[+] zkwasm mock execution success");

}