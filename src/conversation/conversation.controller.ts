import { Controller, Get, Param, Query } from '@nestjs/common';
import { ConversationService } from './conversation.service';

@Controller('conversations')
export class ConversationController {
  constructor(private conversationService: ConversationService) {}

  @Get()
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
  async getActiveConversations() {
    return this.conversationService.getActiveConversations();
  }

  @Get('treatments')
  async getTreatments() {
    return this.conversationService.getTreatments();
  }

  @Get(':id')
  async getConversation(@Param('id') id: string) {
    return this.conversationService.getConversation(id);
  }

  @Get(':id/messages')
  async getConversationMessages(@Param('id') id: string) {
    return this.conversationService.getConversationMessages(id);
  }
}

