export type UserStatus = "active" | "suspended" | "deleted";
export type ArtistVerificationState = "none" | "pending" | "approved" | "rejected";
export type ContentStatus = "active" | "hidden" | "deleted";

export type UserDoc = {
  created_at: string;
  status: UserStatus;
  anon_handle: string;
  verification: {
    identity_verified: boolean;
    hashed_ci: string | null;
    verified_at: string | null;
  };
  artist_verification: {
    state: ArtistVerificationState;
    submitted_links: string[];
    reviewed_at: string | null;
  };
};

export type PostDoc = {
  id: string;
  board_id: string;
  author_anon_name: string;
  title: string;
  content: string;
  tags: string[];
  status: ContentStatus;
  created_at: string;
};
