export type Game = 'pokemon' | 'one_piece';
export type MatchType = 'perfect' | 'partial' | 'value_gap';
export type EventType = 'tournament' | 'locals' | 'trade_table' | 'casual';
export type RecurringType = 'none' | 'weekly' | 'biweekly' | 'monthly';
export type CardStatus = 'want' | 'have';

// Nullable attributes — null means "any" on want entries
export type Condition = 'NM' | 'LP' | 'MP' | 'HP' | 'Damaged';
export type Language = 'EN' | 'JP' | 'DE' | 'FR' | 'ES' | 'IT' | 'PT' | 'KO' | 'ZH';
export type Edition = '1st_ed' | 'unlimited' | 'alt_art' | 'promo' | 'reprint';
// Finish is open-ended: Pokémon uses the named variants; other games (One Piece, etc.) use
// arbitrary strings like 'p1', 'alt_art', 'manga', 'sp' sourced from card_finishes.label.
export type Finish = string;

// Condition rank for matching (lower index = better)
export const CONDITION_RANK: Condition[] = ['NM', 'LP', 'MP', 'HP', 'Damaged'];

export const CONDITION_LABELS: Record<Condition, string> = {
  NM: 'Near Mint',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  Damaged: 'Damaged',
};

export const CONDITION_COLORS: Record<Condition, string> = {
  NM: 'text-green-400',
  LP: 'text-teal-400',
  MP: 'text-amber-400',
  HP: 'text-orange-400',
  Damaged: 'text-red-500',
};

export const LANGUAGE_LABELS: Record<Language, string> = {
  EN: 'English', JP: 'Japanese', DE: 'German', FR: 'French',
  ES: 'Spanish', IT: 'Italian', PT: 'Portuguese', KO: 'Korean', ZH: 'Chinese',
};

export const EDITION_LABELS: Record<Edition, string> = {
  '1st_ed': '1st Edition',
  unlimited: 'Unlimited',
  alt_art: 'Alt Art',
  promo: 'Promo',
  reprint: 'Reprint',
};

// Known finish labels for Pokémon. For other games use available_finishes[].label directly.
export const FINISH_LABELS: Record<string, string> = {
  standard: 'Standard',
  holo: 'Holo',
  reverse_holo: 'Reverse Holo',
  full_art: 'Full Art',
  secret_rare: 'Secret Rare',
  alt_art_holo: 'Alt Art Holo',
  first_edition: '1st Edition',
  promo: 'Promo',
};

export type ActivityEventType = 'trade_completed' | 'new_member' | 'event_created' | 'new_match_area';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  actor_id: string | null;
  payload: ActivityPayload;
  geo_lat: number;
  geo_lng: number;
  created_at: string;
}

export type ActivityPayload =
  | TradeCompletedPayload
  | NewMemberPayload
  | EventCreatedPayload
  | NewMatchAreaPayload;

export interface TradeCompletedPayload {
  type: 'trade_completed';
  username_a: string;
  username_b: string;
  avatar_a: string | null;
  avatar_b: string | null;
  card_name: string;
  game: Game;
  finish: Finish;
  condition: Condition;
}

export interface NewMemberPayload {
  type: 'new_member';
  username: string;
  avatar_url: string | null;
  location_label: string;
  games: Game[];
}

export interface EventCreatedPayload {
  type: 'event_created';
  event_id: string;
  title: string;
  organizer: string;
  event_type: EventType;
  starts_at: string;
  distance_km: number;
  entry_fee_eur: number;
  game: Game | 'all';
}

export interface NewMatchAreaPayload {
  type: 'new_match_area';
  card_name: string;
  external_id: string;
  card_id: string;
  game: Game;
  want_count: number;
  finish_breakdown: Partial<Record<Finish, number>>;
}

export interface User {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  bio: string | null;
  location_label: string;
  reputation_score: number | null;
  trade_count: number;
  is_lgs: boolean;
  is_pro: boolean;
  pro_expires_at: string | null;
  onboarding_completed: boolean;
  onboarding_step: number;
  games: string[];
  unread_notifications: number;
  price_alert_count: number;
  agreed_to_terms_at: string | null;
  created_at: string;
  last_active: string;
}

export interface PriceAlert {
  id: string;
  user_id: string;
  card_id: string;
  card?: Pick<Card, 'id' | 'name' | 'image_url' | 'game' | 'external_id'>;
  finish_id: string | null;
  target_price_eur: number;
  last_price_eur: number | null;
  triggered_at: string | null;
  created_at: string;
}

export interface CardPrices {
  card_id: string;
  card_name: string;
  market_price_eur: number | null;
  condition_prices: { condition: string; price_eur: number }[];
  finishes: {
    finish_id: string;
    label: string;
    market_price_eur: number | null;
    condition_prices: { condition: string; price_eur: number }[];
  }[];
  source: string;
  updated_at: string;
}

export interface EbayComp {
  title: string;
  price_eur: number | null;
  sold_date: string | null;
  url: string | null;
  image_url: string | null;
}

export interface CardFinish {
  finish_id: string;
  label: string;
  image_url: string | null;
  market_price_eur: number | null;
}

export interface CardVariantSummary {
  id: string;
  parallel_id: string;
  variant_type: string | null;
  image_url: string;
  rarity: string;
}

export interface Card {
  id: string;
  external_id: string;
  name: string;
  game: Game;
  set_name: string;
  set_code: string;
  rarity: string;
  image_url: string;
  market_price_eur: number | null;
  is_seed: boolean;
  language: Language;
  /** null for base cards; "p1", "r1", etc. for variants */
  parallel_id: string | null;
  /** "alt_art" | "manga_art" | "sp" | null (base) */
  variant_type: string | null;
  tcgdex_id: string | null;
  illustrator: string | null;
  category: 'Pokemon' | 'Trainer' | 'Energy' | null;
  hp: number | null;
  legal_standard: boolean;
  legal_expanded: boolean;
  available_finishes: CardFinish[];
  /** Number of parallel variants for this base card (search results only) */
  variant_count?: number;
  /** Parallel variant summaries (search results only, base cards only) */
  variants?: CardVariantSummary[];
}

export type GradingCompany = 'PSA' | 'CGC' | 'BGS' | 'ACE' | 'SGC' | 'TAG';

export interface GradingPopulation {
  id: string;
  card_id: string;
  grading_company: GradingCompany;
  pop_10: number | null;
  pop_9: number | null;
  pop_8: number | null;
  pop_7: number | null;
  pop_below_7: number | null;
  total_graded: number | null;
  gem_rate_pct: number | null;
  source_url: string | null;
  fetched_at: string;
}

export interface GradedPriceEntry {
  median_usd: number | null;
  sample_count: number | null;
}

export interface CardGradedPrices {
  card_id: string;
  psa: { grade_10: GradedPriceEntry; grade_9: GradedPriceEntry; grade_8: GradedPriceEntry } | null;
  cgc: { grade_10: GradedPriceEntry; grade_9: GradedPriceEntry } | null;
  bgs: { grade_10: GradedPriceEntry; grade_9: GradedPriceEntry } | null;
  population: { psa: GradingPopulation | null; cgc: GradingPopulation | null; bgs: GradingPopulation | null };
  updated_at: string | null;
}

export interface UserCard {
  id: string;
  user_id: string;
  card_id: string;
  card: Card;
  status: CardStatus;
  quantity: number;
  condition: Condition | null;
  language: Language | null;
  edition: Edition | null;
  finish: Finish | null;
  notes: string | null;
  created_at: string;
  is_graded: boolean;
  grading_company: GradingCompany | null;
  grade: string | null;
  cert_number: string | null;
  graded_at: string | null;
  include_in_trades: boolean;
  slab_image_url: string | null;
  graded_prices?: any;
}

export interface MatchedCard extends Omit<Card, 'language'> {
  condition: Condition | null;
  language: Language | null;
  edition: Edition | null;
  finish: Finish | null;
  quantity: number;
  is_graded?: boolean;
  grading_company?: GradingCompany | null;
  grade?: string | null;
}

export interface TradeMatch {
  id: string;
  user_a_id: string;
  user_b_id: string;
  other_user: PublicUser;
  match_type: MatchType;
  user_a_gets: MatchedCard[];
  user_b_gets: MatchedCard[];
  value_gap_eur: number;
  distance_km: number;
  last_computed: string;
}

export interface PublicUser {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  location_label: string;
  reputation_score: number | null;
  trade_count: number;
  is_lgs: boolean;
  is_pro?: boolean;
  created_at: string;
}

export type ConversationStatus = 'active' | 'proposal_sent' | 'proposal_accepted' | 'meetup_set' | 'completed';

export interface TradeProposal {
  items_i_give: ProposalItem[];
  items_you_give: ProposalItem[];
  proposed_by: string;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'countered';
}

export interface ProposalItem {
  card_id: string;
  external_id: string;
  name: string;
  image_url?: string;
  finish?: string;
  quantity: number;
}

export interface Conversation {
  id: string;
  trade_match_id: string | null;
  participant_ids: string[];
  other_participant: PublicUser;
  last_message: Message | null;
  unread_count: number;
  status: ConversationStatus;
  trade_proposal: TradeProposal | null;
  meetup_location: string | null;
  meetup_time: string | null;
  completed_by_a: boolean;
  completed_by_b: boolean;
  created_at: string;
}

export type MessageType = 'text' | 'trade_proposal' | 'meetup_proposal' | 'system';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender?: PublicUser;
  body: string;
  type: MessageType;
  payload: any;
  read_at: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  payload: any;
  read_at: string | null;
  created_at: string;
}

export interface TradeRating {
  id: string;
  rater_id: string;
  ratee_id: string;
  trade_match_id: string;
  score: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  created_at: string;
  rater?: PublicUser;
}

export interface CompletedTrade {
  id: string;
  user_a_id: string;
  user_b_id: string;
  other_user: PublicUser;
  a_gave: MatchedCard[];
  b_gave: MatchedCard[];
  completed_at: string;
  my_rating: TradeRating | null;
  their_rating: TradeRating | null;
}

export interface Event {
  id: string;
  organizer_id: string;
  organizer?: PublicUser;
  title: string;
  description: string | null;
  game: Game | 'all';
  event_type: EventType;
  address: string;
  latitude: number;
  longitude: number;
  starts_at: string;
  ends_at: string | null;
  entry_fee_eur: number;
  max_attendees: number | null;
  recurring: RecurringType;
  attendee_count: number;
  is_attending: boolean;
  distance_km?: number;
  match_attendees?: string[];
  created_at: string;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface CursorResponse<T> {
  data: T[];
  next_cursor: string | null;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
