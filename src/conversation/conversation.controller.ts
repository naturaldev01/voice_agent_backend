import { Controller, Get, Post, Put, Param, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ConversationService, CreateEvaluationDto, CreateMessageEvaluationDto } from './conversation.service';

@ApiTags('conversations')
@Controller('conversations')
export class ConversationController {
  constructor(private conversationService: ConversationService) {}

  // ============ STATIC ROUTES (must come before :id routes) ============

  @Get()
  @ApiOperation({ summary: 'Get all conversations', description: 'Retrieve a paginated list of conversations' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of records (default: 50)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Records to skip (default: 0)' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by status (active/completed)' })
  @ApiResponse({ status: 200, description: 'List of conversations' })
  async getConversations(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    return this.conversationService.getConversations(
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
      status,
    );
  }

  @Get('active')
  @ApiOperation({ summary: 'Get active conversations', description: 'Retrieve all currently active voice conversations' })
  @ApiResponse({ status: 200, description: 'List of active conversations' })
  async getActiveConversations() {
    return this.conversationService.getActiveConversations();
  }

  @Get('treatments')
  @ApiOperation({ summary: 'Get available treatments', description: 'Retrieve list of available treatments' })
  @ApiResponse({ status: 200, description: 'List of treatments' })
  async getTreatments() {
    return this.conversationService.getTreatments();
  }

  // Knowledge Base endpoints
  @Get('knowledge-base')
  @ApiOperation({ summary: 'Get knowledge base entries', description: 'Get AI learning knowledge base' })
  @ApiQuery({ name: 'language', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Knowledge base entries' })
  async getKnowledgeBase(
    @Query('language') language?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string
  ) {
    return this.conversationService.getKnowledgeBase(
      language,
      category,
      limit ? parseInt(limit, 10) : 50
    );
  }

  @Get('knowledge-base/stats')
  @ApiOperation({ summary: 'Get knowledge base stats', description: 'Get statistics for knowledge base' })
  @ApiResponse({ status: 200, description: 'Knowledge base statistics' })
  async getKnowledgeStats() {
    return this.conversationService.getKnowledgeStats();
  }

  @Put('knowledge-base/:knowledgeId')
  @ApiOperation({ summary: 'Update knowledge entry', description: 'Update a knowledge base entry' })
  @ApiParam({ name: 'knowledgeId', type: String })
  @ApiResponse({ status: 200, description: 'Knowledge entry updated' })
  async updateKnowledgeEntry(
    @Param('knowledgeId') id: string,
    @Body() updates: { category?: string; scenario?: string; ideal_response?: string; comment?: string; is_active?: boolean }
  ) {
    return this.conversationService.updateKnowledgeEntry(id, updates);
  }

  @Put('knowledge-base/:knowledgeId/deactivate')
  @ApiOperation({ summary: 'Deactivate knowledge entry', description: 'Deactivate a knowledge base entry' })
  @ApiParam({ name: 'knowledgeId', type: String })
  @ApiResponse({ status: 200, description: 'Knowledge entry deactivated' })
  async deactivateKnowledgeEntry(@Param('knowledgeId') id: string) {
    return this.conversationService.updateKnowledgeEntry(id, { is_active: false });
  }

  // Evaluation statistics endpoints
  @Get('evaluations/stats')
  @ApiOperation({ summary: 'Get evaluation statistics', description: 'Get counts of good, needs improvement, and bad evaluations' })
  @ApiResponse({ status: 200, description: 'Evaluation statistics' })
  async getEvaluationStats() {
    return this.conversationService.getEvaluationStats();
  }

  @Get('evaluations/pending')
  @ApiOperation({ summary: 'Get unevaluated conversations', description: 'Get list of conversations that need evaluation' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of unevaluated conversations' })
  async getUnevaluatedConversations(@Query('limit') limit?: string) {
    return this.conversationService.getUnevaluatedConversations(
      limit ? parseInt(limit, 10) : 20
    );
  }

  @Put('evaluations/:evaluationId')
  @ApiOperation({ summary: 'Update evaluation', description: 'Update an existing evaluation' })
  @ApiParam({ name: 'evaluationId', type: String, description: 'Evaluation UUID' })
  @ApiResponse({ status: 200, description: 'Evaluation updated' })
  async updateEvaluation(
    @Param('evaluationId') evaluationId: string,
    @Body() evaluation: Partial<CreateEvaluationDto>
  ) {
    return this.conversationService.updateEvaluation(evaluationId, evaluation);
  }

  @Get('message-evaluations/stats')
  @ApiOperation({ summary: 'Get message evaluation stats', description: 'Get statistics for message evaluations' })
  @ApiResponse({ status: 200, description: 'Message evaluation statistics' })
  async getMessageEvaluationStats() {
    return this.conversationService.getMessageEvaluationStats();
  }

  // ============ DYNAMIC :id ROUTES ============

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation by ID', description: 'Retrieve a specific conversation' })
  @ApiParam({ name: 'id', type: String, description: 'Conversation UUID' })
  @ApiResponse({ status: 200, description: 'Conversation found' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async getConversation(@Param('id') id: string) {
    return this.conversationService.getConversation(id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get conversation messages', description: 'Retrieve all messages from a conversation' })
  @ApiParam({ name: 'id', type: String, description: 'Conversation UUID' })
  @ApiResponse({ status: 200, description: 'List of messages' })
  async getConversationMessages(@Param('id') id: string) {
    return this.conversationService.getConversationMessages(id);
  }

  @Get(':id/evaluation')
  @ApiOperation({ summary: 'Get conversation evaluation', description: 'Get the evaluation for a specific conversation' })
  @ApiParam({ name: 'id', type: String, description: 'Conversation UUID' })
  @ApiResponse({ status: 200, description: 'Conversation evaluation' })
  async getEvaluation(@Param('id') id: string) {
    return this.conversationService.getEvaluation(id);
  }

  @Post(':id/evaluation')
  @ApiOperation({ summary: 'Create conversation evaluation', description: 'Evaluate a conversation with rating and feedback' })
  @ApiParam({ name: 'id', type: String, description: 'Conversation UUID' })
  @ApiBody({ 
    description: 'Evaluation data',
    schema: {
      type: 'object',
      properties: {
        rating: { type: 'string', enum: ['bad', 'needs_improvement', 'good'] },
        feedback: { type: 'string' },
        ideal_response: { type: 'string' },
        evaluated_by: { type: 'string' },
      },
      required: ['rating'],
    }
  })
  @ApiResponse({ status: 201, description: 'Evaluation created' })
  async createEvaluation(
    @Param('id') id: string,
    @Body() evaluation: CreateEvaluationDto
  ) {
    return this.conversationService.createEvaluation(id, evaluation);
  }

  @Get(':id/message-evaluations')
  @ApiOperation({ summary: 'Get message evaluations', description: 'Get all message evaluations for a conversation' })
  @ApiParam({ name: 'id', type: String, description: 'Conversation UUID' })
  @ApiResponse({ status: 200, description: 'List of message evaluations' })
  async getMessageEvaluations(@Param('id') id: string) {
    return this.conversationService.getMessageEvaluations(id);
  }

  @Post(':id/messages/:messageId/evaluation')
  @ApiOperation({ summary: 'Evaluate a message', description: 'Rate an individual AI message' })
  @ApiParam({ name: 'id', type: String, description: 'Conversation UUID' })
  @ApiParam({ name: 'messageId', type: String, description: 'Message UUID' })
  @ApiBody({
    description: 'Message evaluation data',
    schema: {
      type: 'object',
      properties: {
        rating: { type: 'string', enum: ['bad', 'neutral', 'good'] },
        comment: { type: 'string' },
        category: { type: 'string' },
        ideal_response: { type: 'string' },
        evaluated_by: { type: 'string' },
      },
      required: ['rating'],
    },
  })
  @ApiResponse({ status: 201, description: 'Message evaluation created' })
  async createMessageEvaluation(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() evaluation: CreateMessageEvaluationDto
  ) {
    return this.conversationService.createMessageEvaluation(messageId, conversationId, evaluation);
  }
}
