import { program } from "commander";
import { config } from "../config.js";
import {
  currentNpmScriptName,
  logDivider,
  logLoadingAnimation,
} from "./common/utils.js";
import { zkwasm_deploy, get_deployed } from "./requests/zkwasm_deploy.js";
import { testNets } from "./common/constants.js";
import { ZkWasmUtil } from "zkwasm-service-helper";
import { readFileSync } from "fs";
import { waitTaskStatus } from "./requests/zkwasm_taskdetails.js";

program.version("1.0.0");
program.argument(
  "[network name]",
  "Name of deployed network for verification contract",
  "sepolia"
);
program.parse(process.argv);
const args = program.args;

// Log script name
console.log(">> DEPLOY VERIFICATION CONTRACT", "\n");

if (args[0] == null) {
  args[0] = "sepolia";
  console.log(`[*] Network name not provided. Using default: ${args[0]}.`, "\n");
}

// Check if network name is valid
const inputtedNetworkName = args[0];
const validNetworkNames = testNets.map((net) => net.name.toLowerCase());
if (!validNetworkNames.includes(inputtedNetworkName.toLowerCase())) {
  console.log(`[-] NETWORK NAME IS INVALID.`, "\n");
  console.log(`[*] Valid networks: ${validNetworkNames.join(", ")}.`, "\n");
  logDivider();
  process.exit(1);
}
const targetNetwork = testNets.find(
  (net) => net.name.toLowerCase() === inputtedNetworkName.toLowerCase()
);

// Get wasm path
let wasmPath;
if (currentNpmScriptName() === "deploy-local") {
  wasmPath = config.LocalWasmBinPath;
} else if (currentNpmScriptName() === "deploy") {
  wasmPath = config.WasmBinPath;
}

// Get md5
const md5 = ZkWasmUtil.convertToMd5(readFileSync(wasmPath)).toUpperCase();
console.log(`[*] IMAGE MD5: ${md5}`, "\n");

let [response, isDeploySuccess, errorMessage] = await zkwasm_deploy(
  targetNetwork.value,
  config.UserPrivateKey,
  md5
  // "63715F93C83BD315345DFDE9A6E0F814"
);

if (isDeploySuccess) {
  const taskId = response.data.result.id;
  console.log(`[+] DEPLOY TASK STARTED. TASK ID: ${taskId}`, "\n");
  console.log("[*] Please wait for deployment... (estimated: 30 sec)", "\n");

  const loading = logLoadingAnimation();

  let taskDetails;
  try {
    taskDetails = await waitTaskStatus(taskId, ["Done", "Fail"], 3000, 0); //TODO: timeout
  } catch (error) {
    loading.stopAndClear();
    console.error(error);
    process.exit(1);
  }

  if (taskDetails.status === "Done") {
    loading.stopAndClear();

    console.log("[+] DEPLOY SUCCESS!", "\n");

    // const [res, _] = await get_deployed("63715F93C83BD315345DFDE9A6E0F814");
    const [res, _] = await get_deployed(md5);

    const verificationContractAddress = res.data.result[0].deployment.find(
      (x) => x.chain_id == targetNetwork.value
    ).address;

    console.log(
      `[+] CONTRACT ADDRESS ON ${targetNetwork.name.toUpperCase()}: ${verificationContractAddress}`,
      "\n"
    );

    logDivider();

    process.exit(0);
  } else {
    loading.stopAndClear();

    console.log("[-] DEPLOY FAILED.", "\n");

    console.log(`[-] ${taskDetails.internal_message}`, "\n");

    logDivider();

    process.exit(1);
  }
} else {
  console.log(`[-] DEPLOY CANNOT BE STARTED.`, "\n");
  console.log(`[-] Error: ${errorMessage}.\n`);
  logDivider();
  process.exit(1);
}
