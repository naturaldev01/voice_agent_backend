import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ConversationService } from './conversation.service';

@ApiTags('conversations')
@Controller('conversations')
export class ConversationController {
  constructor(private conversationService: ConversationService) {}

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
}

