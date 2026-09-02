export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity: {
        Row: {
          actor_member: string | null
          actor_user: string | null
          amount_minor: number | null
          created_at: string
          detail: Json
          expense_id: string | null
          group_id: string
          id: string
          kind: string
          summary: string
        }
        Insert: {
          actor_member?: string | null
          actor_user?: string | null
          amount_minor?: number | null
          created_at?: string
          detail?: Json
          expense_id?: string | null
          group_id: string
          id?: string
          kind: string
          summary: string
        }
        Update: {
          actor_member?: string | null
          actor_user?: string | null
          amount_minor?: number | null
          created_at?: string
          detail?: Json
          expense_id?: string | null
          group_id?: string
          id?: string
          kind?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_actor_member_fkey"
            columns: ["actor_member"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_items: {
        Row: {
          amount_minor: number
          eaten_by: string[]
          expense_id: string
          id: string
          label: string
          position: number
        }
        Insert: {
          amount_minor: number
          eaten_by?: string[]
          expense_id: string
          id?: string
          label: string
          position?: number
        }
        Update: {
          amount_minor?: number
          eaten_by?: string[]
          expense_id?: string
          id?: string
          label?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          base_total_minor: number | null
          category: string
          created_at: string
          created_by: string | null
          created_by_kind: string
          currency: string
          deleted_at: string | null
          description: string
          exact: Json
          extras_policy: Database["public"]["Enums"]["extras_policy"]
          fx_rate: number
          group_id: string
          id: string
          needs_review: string | null
          note: string | null
          occurred_at: string
          participants: string[]
          payer_id: string
          rationale: string[]
          receipt_path: string | null
          split_mode: Database["public"]["Enums"]["split_mode"]
          tax_minor: number
          tip_minor: number
          total_minor: number
          weights: Json
        }
        Insert: {
          base_total_minor?: number | null
          category?: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: string
          currency?: string
          deleted_at?: string | null
          description: string
          exact?: Json
          extras_policy?: Database["public"]["Enums"]["extras_policy"]
          fx_rate?: number
          group_id: string
          id?: string
          needs_review?: string | null
          note?: string | null
          occurred_at?: string
          participants?: string[]
          payer_id: string
          rationale?: string[]
          receipt_path?: string | null
          split_mode?: Database["public"]["Enums"]["split_mode"]
          tax_minor?: number
          tip_minor?: number
          total_minor?: number
          weights?: Json
        }
        Update: {
          base_total_minor?: number | null
          category?: string
          created_at?: string
          created_by?: string | null
          created_by_kind?: string
          currency?: string
          deleted_at?: string | null
          description?: string
          exact?: Json
          extras_policy?: Database["public"]["Enums"]["extras_policy"]
          fx_rate?: number
          group_id?: string
          id?: string
          needs_review?: string | null
          note?: string | null
          occurred_at?: string
          participants?: string[]
          payer_id?: string
          rationale?: string[]
          receipt_path?: string | null
          split_mode?: Database["public"]["Enums"]["split_mode"]
          tax_minor?: number
          tip_minor?: number
          total_minor?: number
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "expenses_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      friends: {
        Row: {
          created_at: string
          display_name: string
          email: string
          friend_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          email?: string
          friend_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          friend_id?: string
          user_id?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          created_at: string
          display_name: string
          group_id: string
          hue: number
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          group_id: string
          hue?: number
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          group_id?: string
          hue?: number
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          currency: string
          deleted_at: string | null
          emoji: string
          id: string
          invite_token: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          currency?: string
          deleted_at?: string | null
          emoji?: string
          id?: string
          invite_token?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          emoji?: string
          id?: string
          invite_token?: string
          name?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          created_at: string
          email: string
          group_id: string
          id: string
          invited_by: string | null
          member_id: string | null
          responded_at: string | null
          status: Database["public"]["Enums"]["invite_status"]
        }
        Insert: {
          created_at?: string
          email: string
          group_id: string
          id?: string
          invited_by?: string | null
          member_id?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["invite_status"]
        }
        Update: {
          created_at?: string
          email?: string
          group_id?: string
          id?: string
          invited_by?: string | null
          member_id?: string | null
          responded_at?: string | null
          status?: Database["public"]["Enums"]["invite_status"]
        }
        Relationships: [
          {
            foreignKeyName: "invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_kind: string
          author_member: string | null
          author_user: string | null
          body: string
          created_at: string
          diff: Json | null
          expense_id: string | null
          group_id: string
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          patch: Json | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          revisions: Json
          status: Database["public"]["Enums"]["proposal_status"] | null
        }
        Insert: {
          author_kind?: string
          author_member?: string | null
          author_user?: string | null
          body?: string
          created_at?: string
          diff?: Json | null
          expense_id?: string | null
          group_id: string
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          patch?: Json | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          revisions?: Json
          status?: Database["public"]["Enums"]["proposal_status"] | null
        }
        Update: {
          author_kind?: string
          author_member?: string | null
          author_user?: string | null
          body?: string
          created_at?: string
          diff?: Json | null
          expense_id?: string | null
          group_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          patch?: Json | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          revisions?: Json
          status?: Database["public"]["Enums"]["proposal_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_member_fkey"
            columns: ["author_member"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      recurring: {
        Row: {
          active: boolean
          cadence: string
          category: string
          created_at: string
          currency: string
          description: string
          group_id: string
          id: string
          next_due: string
          participants: string[]
          payer_id: string
          split_mode: Database["public"]["Enums"]["split_mode"]
          total_minor: number
          weights: Json
        }
        Insert: {
          active?: boolean
          cadence?: string
          category?: string
          created_at?: string
          currency?: string
          description: string
          group_id: string
          id?: string
          next_due: string
          participants?: string[]
          payer_id: string
          split_mode?: Database["public"]["Enums"]["split_mode"]
          total_minor: number
          weights?: Json
        }
        Update: {
          active?: boolean
          cadence?: string
          category?: string
          created_at?: string
          currency?: string
          description?: string
          group_id?: string
          id?: string
          next_due?: string
          participants?: string[]
          payer_id?: string
          split_mode?: Database["public"]["Enums"]["split_mode"]
          total_minor?: number
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "recurring_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount_minor: number
          created_by: string | null
          from_member: string
          group_id: string
          id: string
          note: string | null
          settled_at: string
          to_member: string
        }
        Insert: {
          amount_minor: number
          created_by?: string | null
          from_member: string
          group_id: string
          id?: string
          note?: string | null
          settled_at?: string
          to_member: string
        }
        Update: {
          amount_minor?: number
          created_by?: string | null
          from_member?: string
          group_id?: string
          id?: string
          note?: string | null
          settled_at?: string
          to_member?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_from_member_fkey"
            columns: ["from_member"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_to_member_fkey"
            columns: ["to_member"]
            isOneToOne: false
            referencedRelation: "group_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_friend_to_group: {
        Args: { p_friend: string; p_group: string }
        Returns: string
      }
      join_group: {
        Args: { p_member_id?: string; p_token: string }
        Returns: string
      }
      my_invites: {
        Args: never
        Returns: {
          created_at: string
          group_id: string
          group_name: string
          id: string
          invited_by_name: string
          member_name: string
        }[]
      }
      peek_invite: { Args: { p_token: string }; Returns: Json }
      respond_to_invite: {
        Args: { p_accept: boolean; p_invite: string }
        Returns: string
      }
    }
    Enums: {
      extras_policy: "proportional" | "equal"
      invite_status: "pending" | "accepted" | "declined" | "revoked"
      message_kind: "comment" | "proposal" | "event"
      proposal_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "superseded"
        | "withdrawn"
      split_mode: "equal" | "shares" | "exact" | "items"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      extras_policy: ["proportional", "equal"],
      invite_status: ["pending", "accepted", "declined", "revoked"],
      message_kind: ["comment", "proposal", "event"],
      proposal_status: [
        "pending",
        "accepted",
        "rejected",
        "superseded",
        "withdrawn",
      ],
      split_mode: ["equal", "shares", "exact", "items"],
    },
  },
} as const

