// 출시 전 구독 플랜과 결제 문서의 일치 여부를 점검하는 로컬 스모크 테스트다.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checks = [];

function read(relativePath) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) return "";
  return readFileSync(absolutePath, "utf8");
}

function pass(label, detail = "") {
  checks.push({ ok: true, label, detail });
}

function fail(label, detail = "") {
  checks.push({ ok: false, label, detail });
}

function expectIncludes(source, value, label, fileName) {
  if (source.includes(value)) {
    pass(label, `${fileName}에 ${value} 값이 있습니다.`);
  } else {
    fail(label, `${fileName}에서 ${value} 값을 찾지 못했습니다.`);
  }
}

const billing = read("src/lib/billing.ts");
const envExample = read(".env.example");
const paymentDoc = read("docs/payment-launch.md");
const appStoreDoc = read("docs/app-store-release.md");

if (!billing) fail("결제 플랜 소스", "src/lib/billing.ts 파일을 읽지 못했습니다.");
if (!envExample) fail("환경변수 예시", ".env.example 파일을 읽지 못했습니다.");

for (const planId of ["free", "pro_monthly", "pro_yearly"]) {
  expectIncludes(billing, `id: "${planId}"`, `플랜 ID ${planId}`, "src/lib/billing.ts");
}

for (const productId of ["chart_radar_pro_monthly", "chart_radar_pro_yearly"]) {
  expectIncludes(billing, productId, `앱스토어 상품 ID ${productId}`, "src/lib/billing.ts");
  expectIncludes(appStoreDoc, productId, `앱스토어 문서 상품 ID ${productId}`, "docs/app-store-release.md");
}

for (const envName of [
  "NEXT_PUBLIC_PRO_PAYMENT_URL",
  "NEXT_PUBLIC_PRO_MONTHLY_PAYMENT_URL",
  "NEXT_PUBLIC_PRO_YEARLY_PAYMENT_URL",
]) {
  expectIncludes(envExample, envName, `결제 환경변수 ${envName}`, ".env.example");
  expectIncludes(paymentDoc, envName, `결제 문서 환경변수 ${envName}`, "docs/payment-launch.md");
}

const monthlyAmount = /id:\s*"pro_monthly"[\s\S]*?billingAmount:\s*(\d+)/.exec(billing)?.[1];
const yearlyAmount = /id:\s*"pro_yearly"[\s\S]*?billingAmount:\s*(\d+)/.exec(billing)?.[1];
const yearlyMonthlyValue = /id:\s*"pro_yearly"[\s\S]*?monthlyValue:\s*(\d+)/.exec(billing)?.[1];

if (Number(monthlyAmount) === 19900) {
  pass("월간 실제 청구 금액", "19,900원");
} else {
  fail("월간 실제 청구 금액", `예상 19900, 현재 ${monthlyAmount ?? "미확인"}`);
}

if (Number(yearlyAmount) === 199000) {
  pass("연간 실제 청구 금액", "199,000원");
} else {
  fail("연간 실제 청구 금액", `예상 199000, 현재 ${yearlyAmount ?? "미확인"}`);
}

if (Number(yearlyMonthlyValue) > 0 && Number(yearlyMonthlyValue) < Number(yearlyAmount)) {
  pass("연간 월 환산가 분리", `월 환산가 ${yearlyMonthlyValue}원과 실제 청구 금액 ${yearlyAmount}원이 분리되어 있습니다.`);
} else {
  fail("연간 월 환산가 분리", "monthlyValue와 billingAmount 관계를 확인해 주세요.");
}

const failures = checks.filter((check) => !check.ok);
for (const check of checks) {
  const mark = check.ok ? "PASS" : "FAIL";
  console.log(`${mark.padEnd(4)} ${check.label}${check.detail ? ` - ${check.detail}` : ""}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length}개 결제 모델 항목을 다시 확인해야 합니다.`);
  process.exit(1);
}

console.log("\n구독 플랜과 결제 문서가 기본 점검을 통과했습니다.");
