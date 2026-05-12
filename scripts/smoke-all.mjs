// 출시 전 주요 스모크 테스트를 순서대로 실행하는 통합 점검 스크립트입니다.
import { spawnSync } from "node:child_process";

const checks = [
  ["smoke:ops", "scripts/smoke-ops.mjs"],
  ["smoke:mobile", "scripts/smoke-mobile.mjs"],
  ["smoke:billing", "scripts/smoke-billing.mjs"],
  ["smoke:api", "scripts/smoke-api.mjs"],
  ["smoke:routes", "scripts/smoke-routes.mjs"]
];

for (const [check, script] of checks) {
  console.log(`\n=== ${check} ===`);
  const result = spawnSync(process.execPath, [script], {
    stdio: "inherit",
    shell: false
  });

  if (result.status !== 0) {
    console.error(`\n${check} 점검이 실패했습니다. 위 로그를 먼저 확인해 주세요.`);
    process.exit(result.status ?? 1);
  }
}

console.log("\n전체 출시 스모크 점검이 통과했습니다.");
