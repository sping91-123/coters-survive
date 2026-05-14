// 알트코인 관심 목록과 시장 레이더 감지를 별도 페이지로 보여줍니다.
import { AppFooter } from "@/components/AppFooter";
import { DailyRadarBrief } from "@/components/DailyRadarBrief";
import { Header } from "@/components/Header";
import { LiveMarketChart } from "@/components/LiveMarketChart";
import { MacroTicker } from "@/components/MacroTicker";
import { RadarTopNav } from "@/components/RadarTopNav";
import { SetupScoutPanel } from "@/components/SetupScoutPanel";
import { WatchlistPanel } from "@/components/WatchlistPanel";

export default function AltsPage() {
  return (
    <main className="min-h-screen px-3 pb-10 sm:px-5">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-5">
        <Header market="crypto" />
        <RadarTopNav />
        <MacroTicker compact />
        <LiveMarketChart altOnly />
        <DailyRadarBrief scope="alts" />
        <WatchlistPanel />
        <SetupScoutPanel excludeMajor />
        <AppFooter />
      </div>
    </main>
  );
}
