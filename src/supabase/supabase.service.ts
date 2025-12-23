import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') 
      || this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  // Agent names methods
  async getAgentNamesByLanguage(language: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('agent_names')
      .select('name')
      .eq('language', language);

    if (error) {
      console.error('Error fetching agent names:', error);
      return ['Assistant'];
    }

    return data?.map(item => item.name) || ['Assistant'];
  }

  async getRandomAgentName(language: string): Promise<string> {
    const names = await this.getAgentNamesByLanguage(language);
    const randomIndex = Math.floor(Math.random() * names.length);
    return names[randomIndex] || 'Assistant';
  }

  async getRandomAgent(language: string): Promise<{ name: string; gender: 'male' | 'female' }> {
    const { data, error } = await this.supabase
      .from('agent_names')
      .select('name, gender')
      .eq('language', language);

    if (error || !data || data.length === 0) {
      console.error('Error fetching agent:', error);
      return { name: 'Assistant', gender: 'female' };
    }

    const randomIndex = Math.floor(Math.random() * data.length);
    const agent = data[randomIndex];
    return { 
      name: agent.name, 
      gender: (agent.gender as 'male' | 'female') || 'female' 
    };
  }

  // Treatment methods
  async getTreatments(language: string = 'en') {
    const { data, error } = await this.supabase
      .from('treatments')
      .select('*')
      .order('category');

    if (error) {
      console.error('Error fetching treatments:', error);
      return [];
    }

    return data;
  }

  // Patient methods
  async createPatient(patientData: any) {
    const { data, error } = await this.supabase
      .from('patients')
      .insert(patientData)
      .select()
      .single();

    if (error) {
      console.error('Error creating patient:', error);
      throw error;
    }

    return data;
  }

  async updatePatient(patientId: string, patientData: any) {
    const { data, error } = await this.supabase
      .from('patients')
      .update({ ...patientData, updated_at: new Date().toISOString() })
      .eq('id', patientId)
      .select()
      .single();

    if (error) {
      console.error('Error updating patient:', error);
      throw error;
    }

    return data;
  }

  async getPatientByPhone(phone: string) {
    const { data, error } = await this.supabase
      .from('patients')
      .select('*')
      .eq('phone', phone)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching patient:', error);
    }

    return data;
  }

  // Conversation methods
  async createConversation(conversationData: any) {
    const { data, error } = await this.supabase
      .from('conversations')
      .insert(conversationData)
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      throw error;
    }

    return data;
  }

  async updateConversation(conversationId: string, conversationData: any) {
    const { data, error } = await this.supabase
      .from('conversations')
      .update(conversationData)
      .eq('id', conversationId)
      .select()
      .single();

    if (error) {
      console.error('Error updating conversation:', error);
      throw error;
    }

    return data;
  }

  async addConversationMessage(messageData: any) {
    const { data, error } = await this.supabase
      .from('conversation_messages')
      .insert(messageData)
      .select()
      .single();

    if (error) {
      console.error('Error adding message:', error);
      throw error;
    }

    return data;
  }

  async getConversationMessages(conversationId: string) {
    const { data, error } = await this.supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return [];
    }

    return data;
  }
}

