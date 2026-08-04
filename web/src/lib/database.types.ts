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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: number
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: number
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      branch: {
        Row: {
          id: string
          name: string
          phone: string | null
          tenant_id: string
        }
        Insert: {
          id?: string
          name: string
          phone?: string | null
          tenant_id: string
        }
        Update: {
          id?: string
          name?: string
          phone?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      contract: {
        Row: {
          branch_id: string | null
          created_at: string
          customer_id: string
          down_payment: number
          id: string
          interest_method: string
          interest_rate: number
          num_installments: number
          product_desc: string | null
          start_date: string
          status: string
          tenant_id: string
          total_price: number
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          customer_id: string
          down_payment?: number
          id?: string
          interest_method?: string
          interest_rate?: number
          num_installments: number
          product_desc?: string | null
          start_date: string
          status?: string
          tenant_id: string
          total_price: number
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          customer_id?: string
          down_payment?: number
          id?: string
          interest_method?: string
          interest_rate?: number
          num_installments?: number
          product_desc?: string | null
          start_date?: string
          status?: string
          tenant_id?: string
          total_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_worklist"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "contract_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_invoice: {
        Row: {
          amount: number
          amount_paid: number
          customer_id: string
          due_date: string
          id: string
          invoice_no: string | null
          issue_date: string
          status: string
          tenant_id: string
        }
        Insert: {
          amount: number
          amount_paid?: number
          customer_id: string
          due_date: string
          id?: string
          invoice_no?: string | null
          issue_date?: string
          status?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          amount_paid?: number
          customer_id?: string
          due_date?: string
          id?: string
          invoice_no?: string | null
          issue_date?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_invoice_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_invoice_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_worklist"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "credit_invoice_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      customer: {
        Row: {
          address: string | null
          blacklist_flag: boolean
          created_at: string
          id: string
          name: string
          national_id: string | null
          phone: string
          tenant_id: string
        }
        Insert: {
          address?: string | null
          blacklist_flag?: boolean
          created_at?: string
          id?: string
          name: string
          national_id?: string | null
          phone: string
          tenant_id: string
        }
        Update: {
          address?: string | null
          blacklist_flag?: boolean
          created_at?: string
          id?: string
          name?: string
          national_id?: string | null
          phone?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      installment: {
        Row: {
          amount_due: number
          amount_paid: number
          contract_id: string
          due_date: string
          id: string
          paid_at: string | null
          seq_no: number
          status: string
          tenant_id: string
        }
        Insert: {
          amount_due: number
          amount_paid?: number
          contract_id: string
          due_date: string
          id?: string
          paid_at?: string | null
          seq_no: number
          status?: string
          tenant_id: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          contract_id?: string
          due_date?: string
          id?: string
          paid_at?: string | null
          seq_no?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installment_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contract"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_worklist"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "installment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      payment: {
        Row: {
          amount: number
          contract_id: string | null
          credit_invoice_id: string | null
          customer_id: string
          id: string
          method: string
          receipt_no: number | null
          received_at: string
          reference: string | null
          source: string
          tenant_id: string
        }
        Insert: {
          amount: number
          contract_id?: string | null
          credit_invoice_id?: string | null
          customer_id: string
          id?: string
          method?: string
          receipt_no?: number | null
          received_at?: string
          reference?: string | null
          source?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          contract_id?: string | null
          credit_invoice_id?: string | null
          customer_id?: string
          id?: string
          method?: string
          receipt_no?: number | null
          received_at?: string
          reference?: string | null
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contract"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "v_worklist"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "payment_credit_invoice_fk"
            columns: ["credit_invoice_id"]
            isOneToOne: false
            referencedRelation: "credit_invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_credit_invoice_fk"
            columns: ["credit_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_worklist"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocation: {
        Row: {
          amount: number
          credit_invoice_id: string | null
          id: string
          installment_id: string | null
          payment_id: string
        }
        Insert: {
          amount: number
          credit_invoice_id?: string | null
          id?: string
          installment_id?: string | null
          payment_id: string
        }
        Update: {
          amount?: number
          credit_invoice_id?: string | null
          id?: string
          installment_id?: string | null
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocation_credit_invoice_id_fkey"
            columns: ["credit_invoice_id"]
            isOneToOne: false
            referencedRelation: "credit_invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocation_credit_invoice_id_fkey"
            columns: ["credit_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocation_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocation_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "v_worklist"
            referencedColumns: ["installment_id"]
          },
          {
            foreignKeyName: "payment_allocation_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          branch_id: string | null
          full_name: string
          id: string
          role: string
          tenant_id: string
        }
        Insert: {
          branch_id?: string | null
          full_name: string
          id: string
          role?: string
          tenant_id: string
        }
        Update: {
          branch_id?: string | null
          full_name?: string
          id?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_aging: {
        Row: {
          bucket: string | null
          customer_id: string | null
          due_date: string | null
          id: string | null
          outstanding: number | null
          tenant_id: string | null
        }
        Insert: {
          bucket?: never
          customer_id?: string | null
          due_date?: string | null
          id?: string | null
          outstanding?: never
          tenant_id?: string | null
        }
        Update: {
          bucket?: never
          customer_id?: string | null
          due_date?: string | null
          id?: string | null
          outstanding?: never
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_invoice_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_invoice_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_worklist"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "credit_invoice_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      v_collections_kpi: {
        Row: {
          collected_this_month: number | null
          expected_this_week: number | null
          overdue_total: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      v_worklist: {
        Row: {
          amount: number | null
          contract_id: string | null
          customer_id: string | null
          days_late: number | null
          due_date: string | null
          installment_id: string | null
          name: string | null
          phone: string | null
          status: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      allocate_credit_payment: {
        Args: { p_amount: number; p_invoice: string; p_payment: string }
        Returns: number
      }
      allocate_payment:
        | { Args: { p_amount: number; p_contract: string }; Returns: number }
        | {
            Args: { p_amount: number; p_contract: string; p_payment: string }
            Returns: number
          }
      build_schedule: {
        Args: {
          p_annual_rate: number
          p_financed: number
          p_method?: string
          p_num: number
          p_start: string
        }
        Returns: {
          amount_due: number
          due_date: string
          seq_no: number
        }[]
      }
      create_contract: { Args: { p: Json }; Returns: string }
      current_role: { Args: never; Returns: string }
      current_tenant_id: { Args: never; Returns: string }
      flip_overdue: { Args: never; Returns: number }
      record_payment: {
        Args: {
          p_amount: number
          p_contract: string
          p_credit_invoice: string
          p_customer: string
          p_method: string
        }
        Returns: string
      }
      signup_tenant: {
        Args: { p_full_name: string; p_tenant_name: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
