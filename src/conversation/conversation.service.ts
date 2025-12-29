import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface CreateEvaluationDto {
  rating: 'bad' | 'needs_improvement' | 'good';
  feedback?: string;
  ideal_response?: string;
  evaluated_by?: string;
}

export interface CreateMessageEvaluationDto {
  rating: 'bad' | 'neutral' | 'good';
  comment?: string;
  ideal_response?: string;
  category?: string;
  evaluated_by?: string;
}

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

  // Evaluation methods
  async createEvaluation(conversationId: string, evaluation: CreateEvaluationDto) {
    const client = this.supabaseService.getClient();
    
    // Create evaluation
    const { data, error } = await client
      .from('conversation_evaluations')
      .insert({
        conversation_id: conversationId,
        rating: evaluation.rating,
        feedback: evaluation.feedback,
        ideal_response: evaluation.ideal_response,
        evaluated_by: evaluation.evaluated_by,
        evaluated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Update conversation as evaluated
    await client
      .from('conversations')
      .update({ is_evaluated: true })
      .eq('id', conversationId);

    return data;
  }

  async getEvaluation(conversationId: string) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('conversation_evaluations')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async updateEvaluation(evaluationId: string, evaluation: Partial<CreateEvaluationDto>) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('conversation_evaluations')
      .update({
        ...evaluation,
        evaluated_at: new Date().toISOString(),
      })
      .eq('id', evaluationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getEvaluationStats() {
    const client = this.supabaseService.getClient();
    
    const { data: evaluations, error } = await client
      .from('conversation_evaluations')
      .select('rating');

    if (error) throw error;

    const stats = {
      total: evaluations?.length || 0,
      good: evaluations?.filter(e => e.rating === 'good').length || 0,
      needs_improvement: evaluations?.filter(e => e.rating === 'needs_improvement').length || 0,
      bad: evaluations?.filter(e => e.rating === 'bad').length || 0,
    };

    return stats;
  }

  async getUnevaluatedConversations(limit: number = 20) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('conversations')
      .select(`
        *,
        patients (id, full_name, phone)
      `)
      .eq('status', 'completed')
      .or('is_evaluated.is.null,is_evaluated.eq.false')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  // Message-level evaluation methods
  async createMessageEvaluation(
    messageId: string,
    conversationId: string,
    evaluation: CreateMessageEvaluationDto,
  ) {
    const client = this.supabaseService.getClient();

    // First, get the original message content
    const { data: message } = await client
      .from('conversation_messages')
      .select('content, role')
      .eq('id', messageId)
      .single();

    // Get the previous user message for context (scenario)
    const { data: messages } = await client
      .from('conversation_messages')
      .select('content, role, timestamp')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true });

    let userContext = '';
    if (messages) {
      const msgIndex = messages.findIndex((m) => m.content === message?.content);
      if (msgIndex > 0) {
        // Get up to 2 previous messages for context
        const contextMessages = messages.slice(Math.max(0, msgIndex - 2), msgIndex);
        userContext = contextMessages.map((m) => `${m.role}: ${m.content}`).join('\n');
      }
    }

    // Upsert evaluation
    const { data, error } = await client
      .from('message_evaluations')
      .upsert(
        {
          message_id: messageId,
          conversation_id: conversationId,
          rating: evaluation.rating,
          comment: evaluation.comment,
          ideal_response: evaluation.ideal_response,
          evaluated_by: evaluation.evaluated_by,
          evaluated_at: new Date().toISOString(),
        },
        { onConflict: 'message_id' },
      )
      .select()
      .single();

    if (error) throw error;

    // If rating is bad or neutral and has ideal_response, add to knowledge base
    if ((evaluation.rating === 'bad' || evaluation.rating === 'neutral') && evaluation.ideal_response) {
      const { data: conversation } = await client
        .from('conversations')
        .select('language')
        .eq('id', conversationId)
        .single();

      await client.from('ai_knowledge_base').insert({
        source_message_id: messageId,
        source_evaluation_id: data.id,
        category: evaluation.category || 'general',
        scenario: userContext || 'Direct conversation',
        bad_response: message?.content,
        ideal_response: evaluation.ideal_response,
        comment: evaluation.comment,
        language: conversation?.language || 'tr',
      });
    }

    return data;
  }

  async getMessageEvaluations(conversationId: string) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('message_evaluations')
      .select('*')
      .eq('conversation_id', conversationId);

    if (error) throw error;
    return data || [];
  }

  async getMessageEvaluationStats() {
    const client = this.supabaseService.getClient();

    const { data: evaluations, error } = await client
      .from('message_evaluations')
      .select('rating');

    if (error) throw error;

    const stats = {
      total: evaluations?.length || 0,
      good: evaluations?.filter((e) => e.rating === 'good').length || 0,
      neutral: evaluations?.filter((e) => e.rating === 'neutral').length || 0,
      bad: evaluations?.filter((e) => e.rating === 'bad').length || 0,
    };

    return stats;
  }

  // Knowledge Base methods
  async getKnowledgeBase(language?: string, category?: string, limit: number = 50) {
    const client = this.supabaseService.getClient();
    let query = client
      .from('ai_knowledge_base')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (language) {
      query = query.eq('language', language);
    }
    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getKnowledgeBaseForPrompt(language: string, limit: number = 10) {
    const client = this.supabaseService.getClient();
    
    // Get most recent and relevant knowledge entries for the language
    const { data, error } = await client
      .from('ai_knowledge_base')
      .select('scenario, bad_response, ideal_response, comment, category')
      .eq('language', language)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Increment usage count for these entries
    if (data && data.length > 0) {
      // We'll skip this for now to avoid complexity
    }

    return data || [];
  }

  async updateKnowledgeEntry(id: string, updates: {
    category?: string;
    scenario?: string;
    ideal_response?: string;
    comment?: string;
    is_active?: boolean;
  }) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('ai_knowledge_base')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteKnowledgeEntry(id: string) {
    const client = this.supabaseService.getClient();
    const { error } = await client
      .from('ai_knowledge_base')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  }

  async getKnowledgeStats() {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('ai_knowledge_base')
      .select('category, language, is_active');

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      active: data?.filter((e) => e.is_active).length || 0,
      byCategory: {} as Record<string, number>,
      byLanguage: {} as Record<string, number>,
    };

    data?.forEach((entry) => {
      stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1;
      stats.byLanguage[entry.language] = (stats.byLanguage[entry.language] || 0) + 1;
    });

    return stats;
  }
}

