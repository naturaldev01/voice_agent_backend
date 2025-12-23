import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class PatientService {
  constructor(private supabaseService: SupabaseService) {}

  async getPatients(limit: number = 50, offset: number = 0) {
    const client = this.supabaseService.getClient();
    const { data, error, count } = await client
      .from('patients')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return { data, count };
  }

  async getPatient(id: string) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('patients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async getPatientConversations(patientId: string) {
    const client = this.supabaseService.getClient();
    const { data, error } = await client
      .from('conversations')
      .select(`
        *,
        conversation_messages (*)
      `)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}

