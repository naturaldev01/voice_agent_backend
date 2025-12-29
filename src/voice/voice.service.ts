import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { SupabaseService } from '../supabase/supabase.service';

export interface ConversationContext {
  conversationId: string;
  patientId?: string;
  agentName: string;
  agentGender: 'male' | 'female';
  language: string;
  patientInfo: {
    fullName?: string;
    phone?: string;
    email?: string;
    country?: string;
    city?: string;
    age?: number;
    gender?: string;
    interestedTreatments?: string[];
    notes?: string;
  };
  messageHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private conversations: Map<string, ConversationContext> = new Map();
  private openai: OpenAI;

  constructor(
    private supabaseService: SupabaseService,
    private configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async initializeConversation(language: string = 'en'): Promise<ConversationContext> {
    // Get random agent with name and gender for the detected language
    const agent = await this.supabaseService.getRandomAgent(language);
    
    // Create conversation in database
    const conversation = await this.supabaseService.createConversation({
      agent_name: agent.name,
      language: language,
      status: 'active',
      started_at: new Date().toISOString(),
    });

    const context: ConversationContext = {
      conversationId: conversation.id,
      agentName: agent.name,
      agentGender: agent.gender,
      language,
      patientInfo: {},
      messageHistory: [],
    };

    this.conversations.set(conversation.id, context);
    return context;
  }

  getConversation(conversationId: string): ConversationContext | undefined {
    return this.conversations.get(conversationId);
  }

  async updateConversationLanguage(conversationId: string, language: string): Promise<void> {
    const context = this.conversations.get(conversationId);
    if (context && context.language !== language) {
      // Get a new agent with name and gender for the new language
      const agent = await this.supabaseService.getRandomAgent(language);
      context.language = language;
      context.agentName = agent.name;
      context.agentGender = agent.gender;
      
      // Update in database
      await this.supabaseService.updateConversation(conversationId, {
        language,
        agent_name: agent.name,
      });
    }
  }

  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
  ): Promise<void> {
    const context = this.conversations.get(conversationId);
    if (context) {
      context.messageHistory.push({ role, content });
      
      // Save to database
      await this.supabaseService.addConversationMessage({
        conversation_id: conversationId,
        role,
        content,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async updatePatientInfo(
    conversationId: string,
    patientInfo: Partial<ConversationContext['patientInfo']>,
  ): Promise<void> {
    const context = this.conversations.get(conversationId);
    if (context) {
      context.patientInfo = { ...context.patientInfo, ...patientInfo };
      
      // If we have enough info, create or update patient in database
      if (context.patientInfo.fullName || context.patientInfo.phone) {
        try {
          if (context.patientId) {
            await this.supabaseService.updatePatient(context.patientId, {
              full_name: context.patientInfo.fullName,
              phone: context.patientInfo.phone,
              email: context.patientInfo.email,
              country: context.patientInfo.country,
              city: context.patientInfo.city,
              age: context.patientInfo.age,
              gender: context.patientInfo.gender,
              interested_treatments: context.patientInfo.interestedTreatments,
              notes: context.patientInfo.notes,
              language: context.language,
            });
          } else {
            const patient = await this.supabaseService.createPatient({
              full_name: context.patientInfo.fullName,
              phone: context.patientInfo.phone,
              email: context.patientInfo.email,
              country: context.patientInfo.country,
              city: context.patientInfo.city,
              age: context.patientInfo.age,
              gender: context.patientInfo.gender,
              interested_treatments: context.patientInfo.interestedTreatments,
              notes: context.patientInfo.notes,
              language: context.language,
            });
            context.patientId = patient.id;
            
            // Link patient to conversation
            await this.supabaseService.updateConversation(conversationId, {
              patient_id: patient.id,
            });
          }
        } catch (error) {
          console.error('Error saving patient info:', error);
        }
      }
    }
  }

  async endConversation(conversationId: string, providedSummary?: string): Promise<void> {
    const context = this.conversations.get(conversationId);
    if (context) {
      let summary = providedSummary;
      
      // Generate AI summary if not provided and there's conversation history
      if (!summary && context.messageHistory.length > 0) {
        try {
          summary = await this.generateConversationSummary(context);
          this.logger.log(`Generated summary for conversation ${conversationId}`);
        } catch (error) {
          this.logger.error(`Failed to generate summary: ${error.message}`);
        }
      }
      
      // Calculate lead score
      const leadScore = this.calculateLeadScore(context);
      
      await this.supabaseService.updateConversation(conversationId, {
        status: 'completed',
        ended_at: new Date().toISOString(),
        summary,
        lead_score: leadScore.score,
        lead_status: leadScore.status,
      });
      
      this.conversations.delete(conversationId);
    }
  }

  private async generateConversationSummary(context: ConversationContext): Promise<string> {
    const conversationText = context.messageHistory
      .slice(-20) // Last 20 messages
      .map((m) => `${m.role === 'user' ? 'Patient' : 'Agent'}: ${m.content}`)
      .join('\n');

    const patientInfo = context.patientInfo;

    const prompt = `Summarize this medical consultation conversation in a structured format.

Patient Information Collected:
- Name: ${patientInfo.fullName || 'Not provided'}
- Age: ${patientInfo.age || 'Not provided'}
- Phone: ${patientInfo.phone || 'Not provided'}
- Email: ${patientInfo.email || 'Not provided'}
- Country: ${patientInfo.country || 'Not provided'}
- Interested Treatments: ${patientInfo.interestedTreatments?.join(', ') || 'Not specified'}

Conversation:
${conversationText}

Please provide a brief summary (max 200 words) including:
1. Main treatment interest
2. Key patient concerns
3. Information collected status
4. Recommended next steps
5. Overall patient sentiment (positive/neutral/hesitant)

Write in a professional medical CRM style.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a medical CRM assistant. Summarize patient consultations briefly and professionally.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 300,
        temperature: 0.3,
      });

      return response.choices[0]?.message?.content || 'Summary generation failed';
    } catch (error) {
      this.logger.error('OpenAI summary generation error:', error);
      throw error;
    }
  }

  private calculateLeadScore(context: ConversationContext): { score: number; status: 'hot' | 'warm' | 'cold' } {
    let score = 0;
    const info = context.patientInfo;

    // Contact information (up to 30 points)
    if (info.fullName) score += 10;
    if (info.phone) score += 15;
    if (info.email) score += 5;

    // Personal details (up to 15 points)
    if (info.age) score += 5;
    if (info.country) score += 5;
    if (info.city) score += 5;

    // Treatment interest (up to 30 points)
    if (info.interestedTreatments && info.interestedTreatments.length > 0) {
      score += 15;
      // High-value treatments
      const highValueTreatments = ['hair transplant', 'dental', 'bariatric', 'plastic surgery', 'rhinoplasty'];
      const hasHighValue = info.interestedTreatments.some((t) =>
        highValueTreatments.some((hv) => t.toLowerCase().includes(hv)),
      );
      if (hasHighValue) score += 15;
    }

    // Engagement (up to 25 points based on message count)
    const messageCount = context.messageHistory.filter((m) => m.role === 'user').length;
    if (messageCount >= 10) score += 25;
    else if (messageCount >= 5) score += 15;
    else if (messageCount >= 3) score += 10;
    else if (messageCount >= 1) score += 5;

    // Determine status
    let status: 'hot' | 'warm' | 'cold';
    if (score >= 70) status = 'hot';
    else if (score >= 40) status = 'warm';
    else status = 'cold';

    return { score, status };
  }

  getSystemPrompt(context: ConversationContext): string {
    const languageGreetings: Record<string, string> = {
      tr: `Merhaba, ben Natural Clinic'ten ${context.agentName}. Size nasıl yardımcı olabilirim?`,
      en: `Hello, I'm ${context.agentName} from Natural Clinic. How can I help you today?`,
      de: `Hallo, ich bin ${context.agentName} von Natural Clinic. Wie kann ich Ihnen helfen?`,
      ar: `مرحباً، أنا ${context.agentName} من Natural Clinic. كيف يمكنني مساعدتك؟`,
      fr: `Bonjour, je suis ${context.agentName} de Natural Clinic. Comment puis-je vous aider?`,
      ru: `Здравствуйте, я ${context.agentName} из Natural Clinic. Чем могу вам помочь?`,
    };

    const greeting = languageGreetings[context.language] || languageGreetings.en;

    return `You are ${context.agentName}, a warm, human-sounding health tourism consultant for Natural Clinic Istanbul.
You chat with patients and your goal is to understand their needs, build trust, and gently collect the basic information required for a medical evaluation.

YOUR STYLE - CRITICAL:
- Sound HUMAN, friendly and natural (WhatsApp tone)
- Keep messages SHORT: 1-2 conversational sentences per message
- Never write long paragraphs, never lecture
- Stay warm, calm, and professional. No robotic tone
- Use light, natural emojis only when it fits the moment (😊👇)
- Never use overly formal language. Be smooth and human-like
- Avoid intimate or overly familiar terms like "canım/dear"; stay politely warm and professional
- Address the user politely with "you"

LANGUAGE & ADDRESSING - CRITICAL:
- Detect patient's language from their FIRST message
- Current language: ${context.language}
- If patient speaks DIFFERENT language, IMMEDIATELY call "detect_language" function
- Supported: Turkish (tr), English (en), German (de), Arabic (ar), French (fr), Russian (ru)
- ALWAYS respond in patient's language
- Your greeting: "${greeting}"
- Your name is ${context.agentName}
- For Turkish speakers: If they share a name, add "Bey" (male) or "Hanım" (female) after first name. If gender unclear, politely ask once. Never use Mr/Ms for Turkish.

CONVERSATION RULES - VERY IMPORTANT:
- If user only says "hi/hello", first ask: "May I learn your name so I can address you properly?"
- Never mention any treatment name unless the user mentions it first
- Never give medical diagnosis or guaranteed results
- Complex questions → refer to medical team
- Guide the patient slowly. Do NOT rush into prices, bookings, or aggressive questions
- Collect information naturally through conversation: name → age → concerns → photos (if needed)
- When asking for photos, ask softly and explain it's for doctor evaluation
- Do NOT end messages with: "Do you have any other questions?"
- Move conversation forward with gentle prompts like:
  "If you'd like, you can share a bit more." or
  "Whenever you feel ready, you can send me the details."
- Always stay patient and human-like. No bot patterns.

CONVERSATION FLOW:
1. Warm welcome → learn their name
2. Ask what they would like help with
3. After they state the treatment, gently ask for necessary info (age, concerns)
4. When appropriate, softly request photos for evaluation
5. Keep the flow natural and adapt to user's tone

ABOUT NATURAL CLINIC (use only when relevant):
Natural Clinic is a leading aesthetics hospital in Turkey. We specialize in:
- Hair Transplantation (FUE, FUE Sapphire, DHI)
- Dentistry (Hollywood Smile, Veneers, Dental Implants)
- Bariatric Surgery (Gastric Sleeve, Gastric Bypass)
- Plastic Surgery (Rhinoplasty, Liposuction, BBL)
15+ years experience, 95% patient satisfaction, 5-star Trustpilot reviews.

KNOWLEDGE (share only when asked):
Hair: FUE (up to 5000 grafts), DHI (no shaving), PRP included, 3 nights stay, results 12-18 months
Dental: Emax/Zirconia veneers, Straumann/Medentika/Osstem implants, two visits for implants+crowns
Bariatric: BMI 35-40+ eligible, 6 nights stay

PRICING:
- Never give exact prices without evaluation
- Say "prices vary based on your specific needs"
- Packages include: procedure, hotel, VIP transfers, translator

INFORMATION TO COLLECT (naturally, one at a time):
- Full name
- Age
- Any chronic diseases or medications
- Photos for evaluation (when appropriate)

IF UNSURE:
- Say "Let me check with our medical team and get back to you"

CRITICAL RESTRICTION - YOU MUST FOLLOW:
- You are ONLY a Natural Clinic Istanbul consultant. You work ONLY for Natural Clinic.
- You can ONLY discuss Natural Clinic services: Hair Transplant, Dental, Bariatric Surgery, Plastic Surgery
- If asked about anything unrelated to Natural Clinic or medical tourism, politely say: "I'm here specifically to help with Natural Clinic's treatments. Is there something I can help you with regarding our services?"
- NEVER pretend to be a general AI assistant
- NEVER answer questions about other topics, other clinics, general knowledge, etc.
- You are ${context.agentName} from Natural Clinic Istanbul, Turkey. This is your ONLY identity.

Current patient info: ${JSON.stringify(context.patientInfo, null, 2)}
Conversation history: ${context.messageHistory.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}`;
  }
}

