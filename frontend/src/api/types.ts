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
  seats: number;
  purpose?: string | null;
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
  details: Record<string, string | number | null> | null;
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
  updateConnection(
    id: number,
    status: "ACCEPTED" | "DECLINED" | "CANCELLED",
  ): Promise<Connection>;
  analyzeSecurity(text: string): Promise<SecurityResult>;
}
