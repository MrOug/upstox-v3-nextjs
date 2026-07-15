export interface MonthlyData {
  date: string;
  open: string;
  close: string;
  high: string;
  low: string;
  change: string;
  py?: number;
  pm?: number;
}

export interface NumericPatternEntry {
  value: number;
  avgReturn: number;
  count: number;
}

export interface NumerologyRecommendation {
  /** Overall 0-100 score */
  score: number;
  /** PY component 0-100 */
  pyScore: number;
  /** PM component 0-100 */
  pmScore: number;
  lifePath: number;
  companyZodiac: string;
  currentPY: number;
  currentPM: number;
  /** The PY value that historically performed best for this stock */
  bestPY: NumericPatternEntry;
  /** The PM value that historically performed best for this stock */
  bestPM: NumericPatternEntry;
  /** The PY value that historically performed worst */
  worstPY: NumericPatternEntry;
  /** The PM value that historically performed worst */
  worstPM: NumericPatternEntry;
  /** Full breakdown of average returns per PY value */
  pyHistory: NumericPatternEntry[];
  /** Full breakdown of average returns per PM value */
  pmHistory: NumericPatternEntry[];
  label: RecommendationLabel;
  /** Human-readable summary of why this recommendation was made */
  summary: string;
}

export type RecommendationLabel = 'STRONG BUY' | 'BUY' | 'NEUTRAL' | 'AVOID';

export interface StockResult {
  symbol: string;
  companyName: string;
  incorporationDate: string;
  latestPrice: string;
  oldestPrice: string;
  highPrice: string;
  lowPrice: string;
  change: string;
  percentChange: string;
  dataPoints: number;
  monthlyData?: MonthlyData[];
  recommendation?: NumerologyRecommendation;
}

export interface StockResultWithRec extends StockResult {
  recommendation: NumerologyRecommendation;
}

export type DataMode =
  | 'manual'
  | 'topGainers' | 'topLosers'
  | 'weeklyGainers' | 'weeklyLosers'
  | 'monthlyGainers' | 'monthlyLosers'
  | 'myHoldings'
  | 'top50' | 'nifty50' | 'niftyNext50' | 'bankNifty' | 'sensex'
  | `sector${string}`;

export const RECOMMENDATION_COLORS: Record<RecommendationLabel, string> = {
  'STRONG BUY': '#00c853',
  'BUY': '#64dd17',
  'NEUTRAL': '#ffd600',
  'AVOID': '#ff1744',
};

export const RECOMMENDATION_ORDER: RecommendationLabel[] = [
  'STRONG BUY', 'BUY', 'NEUTRAL', 'AVOID',
];
