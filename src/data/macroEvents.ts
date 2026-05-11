// 매크로 레이더 일정 데이터를 한곳에서 관리한다.
export type MacroEventState = "upcoming" | "released" | "watch";
export type MacroEventImportance = 1 | 2 | 3;
export type MacroEventSource = "BLS" | "BEA" | "Fed" | "Census";

export type MacroEventItem = {
  label: string;
  releaseAt: string;
  dateKst: string;
  dateEt: string;
  state: MacroEventState;
  importance: MacroEventImportance;
  actual?: string;
  forecast?: string;
  previous?: string;
  summary: string;
  marketImpact: string;
  source: MacroEventSource;
  sourceUrl: string;
};

export const macroCalendarUpdatedAt = "2026년 5월 11일 기준";

export const macroCalendarSourceNote =
  "BLS, BEA, Federal Reserve 공개 캘린더 기준입니다. 출시 운영 단계에서는 매주 월요일 수동 갱신하거나 공식 캘린더 연동으로 교체합니다.";

export const macroItems: MacroEventItem[] = [
  {
    label: "CPI / Core CPI",
    releaseAt: "2026-05-12T21:30:00+09:00",
    dateKst: "5월 12일 21:30",
    dateEt: "May 12 08:30 ET",
    state: "upcoming",
    importance: 3,
    actual: "발표 전",
    forecast: "컨센서스 확인 필요",
    previous: "3월 CPI 이후 4월 물가 확인",
    summary: "미국 소비자물가가 다시 둔화되는지 확인하는 핵심 발표입니다.",
    marketImpact: "예상보다 높으면 금리 부담과 달러 강세로 코인과 성장주 변동성이 커질 수 있습니다.",
    source: "BLS",
    sourceUrl: "https://www.bls.gov/schedule/news_release/cpi.htm"
  },
  {
    label: "PPI",
    releaseAt: "2026-05-13T21:30:00+09:00",
    dateKst: "5월 13일 21:30",
    dateEt: "May 13 08:30 ET",
    state: "upcoming",
    importance: 2,
    actual: "발표 전",
    forecast: "컨센서스 확인 필요",
    previous: "3월 PPI 이후 생산자 물가 확인",
    summary: "생산자 물가가 소비자 물가로 이어질 가능성을 보는 발표입니다.",
    marketImpact: "CPI 직후 인플레이션 기대를 다시 흔들 수 있어 단기 추격 진입은 주의가 필요합니다.",
    source: "BLS",
    sourceUrl: "https://www.bls.gov/schedule/news_release/ppi.htm"
  },
  {
    label: "FOMC",
    releaseAt: "2026-06-18T03:00:00+09:00",
    dateKst: "6월 18일 03:00",
    dateEt: "Jun 17 14:00 ET",
    state: "upcoming",
    importance: 3,
    actual: "회의 전",
    forecast: "금리 경로와 성명서 문구 확인",
    previous: "4월 회의 이후 다음 정책 회의",
    summary: "금리 결정, 성명서, 기자회견이 함께 나오는 가장 큰 매크로 이벤트입니다.",
    marketImpact: "점도표와 기자회견이 예상보다 매파적이면 코인과 기술주 모두 급변동할 수 있습니다.",
    source: "Fed",
    sourceUrl: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
  },
  {
    label: "Personal Income and Outlays",
    releaseAt: "2026-06-25T21:30:00+09:00",
    dateKst: "6월 25일 21:30",
    dateEt: "Jun 25 08:30 ET",
    state: "upcoming",
    importance: 3,
    actual: "발표 전",
    forecast: "PCE 물가와 소비 흐름 확인",
    previous: "4월 발표 이후 5월 데이터 확인",
    summary: "연준이 중요하게 보는 PCE 물가와 소비 흐름이 함께 나오는 발표입니다.",
    marketImpact: "PCE 둔화가 확인되면 위험자산에는 우호적이고, 높게 나오면 금리 부담이 커질 수 있습니다.",
    source: "BEA",
    sourceUrl: "https://www.bea.gov/news/schedule"
  },
  {
    label: "Employment Situation",
    releaseAt: "2026-06-05T21:30:00+09:00",
    dateKst: "6월 5일 21:30",
    dateEt: "Jun 5 08:30 ET",
    state: "watch",
    importance: 3,
    actual: "발표 전",
    forecast: "고용 증가와 실업률 확인",
    previous: "5월 고용 발표 대기",
    summary: "고용 강도와 임금 압력이 금리 기대를 다시 움직일 수 있는 발표입니다.",
    marketImpact: "고용이 너무 강하면 금리 인하 기대가 약해지고, 너무 약하면 경기 둔화 우려가 커질 수 있습니다.",
    source: "BLS",
    sourceUrl: "https://www.bls.gov/schedule/news_release/empsit.htm"
  }
];
