import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ConversationService {
  constructor(private supabaseService: SupabaseService) {}

  async getConversations(limit: number = 50, offset: number = 0, status?: string) {
    const client = this.supabaseService.getClient();
    let query = client
      .from('conversations')
      .select(`
        *,
        patients (id, full_name, phone, email)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) throw error;
    return { data, count };
  }

  async getConversation(id: string) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('conversations')
      .select(`
        *,
        patients (*),
        conversation_messages (*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async getConversationMessages(conversationId: string) {
    return this.supabaseService.getConversationMessages(conversationId);
  }

  async getActiveConversations() {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('conversations')
      .select(`
        *,
        patients (id, full_name, phone)
      `)
      .eq('status', 'active')
      .order('started_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async getTreatments() {
    return this.supabaseService.getTreatments();
  }
}

