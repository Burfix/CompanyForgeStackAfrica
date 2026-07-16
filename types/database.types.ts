// AUTO-GENERATED — do not hand-edit.
// Regenerate with the Supabase MCP `generate_typescript_types` tool.
// Source of truth: Supabase project "ForgeStack Founder OS" (zqsinfrgiuulxkyydeun)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor_id: string | null
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          organization_id: string
          title: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id: string
          title: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          attention_mode: Database["public"]["Enums"]["project_attention_mode"]
          blocked_reason: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_value: string | null
          description: string | null
          due_date: string | null
          founder_required: boolean
          health: Database["public"]["Enums"]["milestone_health"]
          health_note: string | null
          id: string
          last_activity_at: string
          next_review_at: string | null
          organization_id: string
          owner_id: string | null
          priority: Database["public"]["Enums"]["project_priority_level"]
          progress_mode: Database["public"]["Enums"]["milestone_progress_mode"]
          progress_percent: number
          project_id: string
          sort_order: number
          start_date: string | null
          status: Database["public"]["Enums"]["milestone_status"]
          success_criteria: string | null
          target_value: string | null
          title: string
          updated_at: string
          waiting_on: string | null
        }
        Insert: {
          attention_mode?: Database["public"]["Enums"]["project_attention_mode"]
          blocked_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_value?: string | null
          description?: string | null
          due_date?: string | null
          founder_required?: boolean
          health?: Database["public"]["Enums"]["milestone_health"]
          health_note?: string | null
          id?: string
          last_activity_at?: string
          next_review_at?: string | null
          organization_id: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["project_priority_level"]
          progress_mode?: Database["public"]["Enums"]["milestone_progress_mode"]
          progress_percent?: number
          project_id: string
          sort_order?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["milestone_status"]
          success_criteria?: string | null
          target_value?: string | null
          title: string
          updated_at?: string
          waiting_on?: string | null
        }
        Update: {
          attention_mode?: Database["public"]["Enums"]["project_attention_mode"]
          blocked_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_value?: string | null
          description?: string | null
          due_date?: string | null
          founder_required?: boolean
          health?: Database["public"]["Enums"]["milestone_health"]
          health_note?: string | null
          id?: string
          last_activity_at?: string
          next_review_at?: string | null
          organization_id?: string
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["project_priority_level"]
          progress_mode?: Database["public"]["Enums"]["milestone_progress_mode"]
          progress_percent?: number
          project_id?: string
          sort_order?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["milestone_status"]
          success_criteria?: string | null
          target_value?: string | null
          title?: string
          updated_at?: string
          waiting_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_dependencies: {
        Row: {
          created_at: string
          created_by: string | null
          dependency_type: Database["public"]["Enums"]["project_dependency_type"]
          depends_on_project_id: string
          id: string
          note: string | null
          organization_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dependency_type?: Database["public"]["Enums"]["project_dependency_type"]
          depends_on_project_id: string
          id?: string
          note?: string | null
          organization_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dependency_type?: Database["public"]["Enums"]["project_dependency_type"]
          depends_on_project_id?: string
          id?: string
          note?: string | null
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_dependencies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_dependencies_depends_on_project_id_fkey"
            columns: ["depends_on_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_dependencies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_dependencies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          attention_mode: Database["public"]["Enums"]["project_attention_mode"]
          blocked_reason: string | null
          business_impact: string[]
          category: string | null
          created_at: string
          created_by: string | null
          current_value: string | null
          description: string | null
          desired_outcome: string | null
          due_date: string | null
          focus_level: number
          founder_attention_required: boolean
          health: Database["public"]["Enums"]["project_health"]
          health_note: string | null
          id: string
          last_activity_at: string
          name: string
          next_review_at: string | null
          organization_id: string
          owner_id: string | null
          priority_level: Database["public"]["Enums"]["project_priority_level"]
          priority_score: number
          progress_mode: Database["public"]["Enums"]["project_progress_mode"]
          progress_percent: number
          review_cadence: Database["public"]["Enums"]["project_review_cadence"]
          slug: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          success_metric: string | null
          target_date: string | null
          target_outcome: string | null
          target_value: string | null
          updated_at: string
          waiting_on: string | null
        }
        Insert: {
          archived_at?: string | null
          attention_mode?: Database["public"]["Enums"]["project_attention_mode"]
          blocked_reason?: string | null
          business_impact?: string[]
          category?: string | null
          created_at?: string
          created_by?: string | null
          current_value?: string | null
          description?: string | null
          desired_outcome?: string | null
          due_date?: string | null
          focus_level?: number
          founder_attention_required?: boolean
          health?: Database["public"]["Enums"]["project_health"]
          health_note?: string | null
          id?: string
          last_activity_at?: string
          name: string
          next_review_at?: string | null
          organization_id: string
          owner_id?: string | null
          priority_level?: Database["public"]["Enums"]["project_priority_level"]
          priority_score?: number
          progress_mode?: Database["public"]["Enums"]["project_progress_mode"]
          progress_percent?: number
          review_cadence?: Database["public"]["Enums"]["project_review_cadence"]
          slug?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          success_metric?: string | null
          target_date?: string | null
          target_outcome?: string | null
          target_value?: string | null
          updated_at?: string
          waiting_on?: string | null
        }
        Update: {
          archived_at?: string | null
          attention_mode?: Database["public"]["Enums"]["project_attention_mode"]
          blocked_reason?: string | null
          business_impact?: string[]
          category?: string | null
          created_at?: string
          created_by?: string | null
          current_value?: string | null
          description?: string | null
          desired_outcome?: string | null
          due_date?: string | null
          focus_level?: number
          founder_attention_required?: boolean
          health?: Database["public"]["Enums"]["project_health"]
          health_note?: string | null
          id?: string
          last_activity_at?: string
          name?: string
          next_review_at?: string | null
          organization_id?: string
          owner_id?: string | null
          priority_level?: Database["public"]["Enums"]["project_priority_level"]
          priority_score?: number
          progress_mode?: Database["public"]["Enums"]["project_progress_mode"]
          progress_percent?: number
          review_cadence?: Database["public"]["Enums"]["project_review_cadence"]
          slug?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          success_metric?: string | null
          target_date?: string | null
          target_outcome?: string | null
          target_value?: string | null
          updated_at?: string
          waiting_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_minutes: number | null
          assignee_id: string | null
          attention_mode: Database["public"]["Enums"]["project_attention_mode"]
          blocked_reason: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_at: string | null
          due_date: string | null
          estimated_minutes: number | null
          founder_required: boolean
          id: string
          last_activity_at: string
          milestone_id: string | null
          next_action: string | null
          notes: string | null
          organization_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          source_reference: string | null
          source_type: string
          start_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          waiting_on: string | null
        }
        Insert: {
          actual_minutes?: number | null
          assignee_id?: string | null
          attention_mode?: Database["public"]["Enums"]["project_attention_mode"]
          blocked_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          due_date?: string | null
          estimated_minutes?: number | null
          founder_required?: boolean
          id?: string
          last_activity_at?: string
          milestone_id?: string | null
          next_action?: string | null
          notes?: string | null
          organization_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          source_reference?: string | null
          source_type?: string
          start_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          waiting_on?: string | null
        }
        Update: {
          actual_minutes?: number | null
          assignee_id?: string | null
          attention_mode?: Database["public"]["Enums"]["project_attention_mode"]
          blocked_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          due_date?: string | null
          estimated_minutes?: number | null
          founder_required?: boolean
          id?: string
          last_activity_at?: string
          milestone_id?: string | null
          next_action?: string | null
          notes?: string | null
          organization_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          source_reference?: string | null
          source_type?: string
          start_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          waiting_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      milestone_health:
        | "healthy"
        | "needs_attention"
        | "at_risk"
        | "off_track"
        | "unknown"
      milestone_progress_mode: "automatic" | "manual"
      milestone_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "missed"
        | "blocked"
        | "waiting"
        | "cancelled"
      org_role: "owner" | "admin" | "member" | "viewer"
      project_attention_mode: "founder" | "delegated" | "team" | "no_attention"
      project_dependency_type: "blocks" | "depends_on" | "related_to"
      project_health:
        | "on_track"
        | "at_risk"
        | "off_track"
        | "healthy"
        | "needs_attention"
        | "unknown"
      project_priority_level: "urgent" | "high" | "medium" | "low"
      project_progress_mode: "manual" | "milestones"
      project_review_cadence:
        | "weekly"
        | "biweekly"
        | "monthly"
        | "quarterly"
        | "milestone_based"
        | "none"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
        | "proposed"
        | "at_risk"
        | "blocked"
        | "parked"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status:
        | "todo"
        | "in_progress"
        | "blocked"
        | "done"
        | "cancelled"
        | "inbox"
        | "planned"
        | "waiting"
        | "review"
        | "completed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      milestone_health: [
        "healthy",
        "needs_attention",
        "at_risk",
        "off_track",
        "unknown",
      ],
      milestone_progress_mode: ["automatic", "manual"],
      milestone_status: [
        "pending",
        "in_progress",
        "completed",
        "missed",
        "blocked",
        "waiting",
        "cancelled",
      ],
      org_role: ["owner", "admin", "member", "viewer"],
      project_attention_mode: ["founder", "delegated", "team", "no_attention"],
      project_dependency_type: ["blocks", "depends_on", "related_to"],
      project_health: [
        "on_track",
        "at_risk",
        "off_track",
        "healthy",
        "needs_attention",
        "unknown",
      ],
      project_priority_level: ["urgent", "high", "medium", "low"],
      project_progress_mode: ["manual", "milestones"],
      project_review_cadence: [
        "weekly",
        "biweekly",
        "monthly",
        "quarterly",
        "milestone_based",
        "none",
      ],
      project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
        "proposed",
        "at_risk",
        "blocked",
        "parked",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: [
        "todo",
        "in_progress",
        "blocked",
        "done",
        "cancelled",
        "inbox",
        "planned",
        "waiting",
        "review",
        "completed",
      ],
    },
  },
} as const
