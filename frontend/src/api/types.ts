export type Category = "RIDE" | "STUDY" | "RESTAURANT" | "COMMUNITY";
export type UnderstandingCategory = Category | "CYBERSECURITY";
export type Intent = "REQUEST" | "OFFER" | "PARTNER";
export type PostStatus = "OPEN" | "COMPLETED" | "CANCELLED";
export type ConnectionStatus =
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED"
  | "CANCELLED";
export type MatchingMode = "SEMANTIC" | "HEURISTIC";
export type AnalysisMode = "LLM" | "HEURISTIC";
export type CommunitySubcategory =
  | "BORROW_LEND"
  | "CAMPUS_HELP"
  | "ACTIVITY"
  | "MOVING"
  | "SHOPPING"
  | "NEW_STUDENT"
  | "OTHER";
export interface UserSummary {
  id: number;
  name: string;
}
export interface StudentUser extends UserSummary {
  username: string;
}
export interface StudentSession {
  user: StudentUser | null;
  csrf_token: string | null;
}
export interface RideDetails {
  origin: string;
  destination: string;
  origin_point: GeoPoint;
  destination_point: GeoPoint;
  seats: number;
  purpose?: string | null;
}
export interface GeoPoint {
  lat: number;
  lng: number;
}
export type DraftDetails = Record<string, string | number | GeoPoint | null>;
export interface RideAvailability {
  total_seats: number;
  reserved_seats: number;
  remaining_seats: number;
}
export interface StudyDetails {
  course: string | null;
  topic: string | null;
  skill_level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null;
  mode: "ONLINE" | "IN_PERSON" | null;
}
export interface FoodDetails {
  restaurant: string | null;
  cuisine: string | null;
  activity_type: "DINING" | "GROUP_ORDER" | "TRIP";
  group_size: number;
}
export interface CommunityDetails {
  subcategory: CommunitySubcategory;
  item?: string | null;
  activity?: string | null;
}
export type PostDetails =
  | RideDetails
  | StudyDetails
  | FoodDetails
  | CommunityDetails;
export interface CommonPostInput {
  title: string;
  text: string;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
}
export type CreatePostInput = CommonPostInput &
  (
    | { category: "RIDE"; intent: "REQUEST" | "OFFER"; details: RideDetails }
    | { category: "STUDY"; intent: Intent; details: StudyDetails }
    | {
        category: "RESTAURANT";
        intent: "REQUEST" | "OFFER";
        details: FoodDetails;
      }
    | { category: "COMMUNITY"; intent: Intent; details: CommunityDetails }
  );
export type Post = CreatePostInput & {
  id: number;
  author: UserSummary;
  status: PostStatus;
  created_at: string;
  updated_at: string;
  ride_availability?: RideAvailability | null;
};
export interface PostList {
  items: Post[];
  total: number;
  limit: number;
  offset: number;
}
export interface PostQuery {
  category?: Category;
  status?: PostStatus;
  user_id?: number;
  limit?: number;
  offset?: number;
}
export interface UnderstandInput {
  text: string;
  category_hint?: UnderstandingCategory | null;
  reference_time: string;
  timezone: string;
}
export interface Understanding extends CommonPostInput {
  category: UnderstandingCategory;
  intent: Intent | null;
  details: DraftDetails | null;
  missing_fields: string[];
  warnings: string[];
  analysis_mode: AnalysisMode;
}
export interface Match {
  post: Post;
  score: number;
  reasons: string[];
  warnings: string[];
}
export interface MatchResponse {
  post_id: number;
  matching_mode: MatchingMode;
  matches: Match[];
}
export interface Connection {
  id: number;
  requester_id: number;
  receiver_id: number;
  source_post_id: number;
  target_post_id: number;
  status: ConnectionStatus;
  created_at: string;
  updated_at: string;
  reserved_seats: number;
}
export interface PostJoin {
  id: number;
  post: Post;
  requester: UserSummary;
  receiver: UserSummary;
  category: Category;
  post_intent: Intent;
  status: ConnectionStatus;
  requested_seats: number;
  reserved_seats: number;
  created_at: string;
  updated_at: string;
}
export type ThreadKind = "connection" | "join";
export interface Message {
  id: number;
  connection_id: number | null;
  join_id: number | null;
  sender: UserSummary;
  text: string;
  created_at: string;
}
export interface MessageQuery {
  limit?: number;
  before_id?: number;
  after_id?: number;
}
export interface MessageList {
  items: Message[];
  has_more: boolean;
}
export type NotificationKind = "NEW_MESSAGE" | "JOIN_REQUEST" | "JOIN_ACCEPTED" | "CONNECTION_REQUEST" | "CONNECTION_ACCEPTED";
export interface StudentNotification {
  id: number;
  kind: NotificationKind;
  actor: UserSummary;
  post_title: string;
  connection_id: number | null;
  join_id: number | null;
  message_id: number | null;
  created_at: string;
  read_at: string | null;
}
export interface NotificationQuery {
  limit?: number;
  unread_only?: boolean;
  before_id?: number;
  after_id?: number;
}
export interface NotificationList {
  items: StudentNotification[];
  unread_count: number;
  has_more: boolean;
}
export interface SecurityResult {
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  reasons: { code: string; description: string }[];
  recommendation: string;
  limitations: string;
  analysis_mode: AnalysisMode;
}
export interface FieldError {
  field: string;
  message: string;
}
export interface ErrorEnvelope {
  error: { code: string; message: string; details: FieldError[] };
}
export interface DiningMenuResponse {
  date: string;
  timezone: "America/Chicago";
  fetched_at: string;
  halls: {
    id: "todd" | "ellis";
    name: string;
    source_url: string;
    status: "AVAILABLE" | "EMPTY" | "UNAVAILABLE";
    message: string | null;
    meals: { name: string; stations: { name: string; items: string[] }[] }[];
  }[];
}
export interface ApiClient {
  health(): Promise<{ status: "ok" }>;
  login(username: string, password: string): Promise<StudentSession>;
  getSession(): Promise<StudentSession>;
  logout(): Promise<StudentSession>;
  getDiningMenus(): Promise<DiningMenuResponse>;
  understand(input: UnderstandInput): Promise<Understanding>;
  createPost(input: CreatePostInput): Promise<Post>;
  listPosts(query?: PostQuery): Promise<PostList>;
  getPost(id: number): Promise<Post>;
  editPost(id: number, input: CreatePostInput): Promise<Post>;
  updatePost(id: number, status: "COMPLETED" | "CANCELLED"): Promise<Post>;
  getMatches(post_id: number, limit?: number): Promise<MatchResponse>;
  createConnection(
    source_post_id: number,
    target_post_id: number,
  ): Promise<Connection>;
  listConnections(status?: ConnectionStatus): Promise<{ items: Connection[] }>;
  getConnection(id: number): Promise<Connection>;
  updateConnection(
    id: number,
    status: "ACCEPTED" | "DECLINED" | "CANCELLED",
  ): Promise<Connection>;
  joinPost(post_id: number, seats?: number): Promise<PostJoin>;
  listJoins(status?: ConnectionStatus): Promise<{ items: PostJoin[] }>;
  getJoin(id: number): Promise<PostJoin>;
  updateJoin(id: number, status: "ACCEPTED" | "DECLINED" | "CANCELLED"): Promise<PostJoin>;
  listMessages(kind: ThreadKind, id: number, query?: MessageQuery): Promise<MessageList>;
  sendMessage(kind: ThreadKind, id: number, text: string): Promise<Message>;
  listNotifications(query?: NotificationQuery): Promise<NotificationList>;
  readNotification(id: number): Promise<StudentNotification>;
  readNotifications(through_id: number): Promise<{ unread_count: number }>;
  readThreadNotifications(kind: ThreadKind, thread_id: number, through_message_id?: number): Promise<{ unread_count: number }>;
  analyzeSecurity(text: string): Promise<SecurityResult>;
}
