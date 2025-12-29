import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiResponse } from '@nestjs/swagger';
import { PatientService } from './patient.service';

@ApiTags('patients')
@Controller('patients')
export class PatientController {
  constructor(private patientService: PatientService) {}

  @Get()
  @ApiOperation({ summary: 'Get all patients', description: 'Retrieve a paginated list of patients' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of records to return (default: 50)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of records to skip (default: 0)' })
  @ApiResponse({ status: 200, description: 'List of patients returned successfully' })
  async getPatients(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.patientService.getPatients(
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get patient by ID', description: 'Retrieve a specific patient by their ID' })
  @ApiParam({ name: 'id', type: String, description: 'Patient UUID' })
  @ApiResponse({ status: 200, description: 'Patient found' })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  async getPatient(@Param('id') id: string) {
    return this.patientService.getPatient(id);
  }

  @Get(':id/conversations')
  @ApiOperation({ summary: 'Get patient conversations', description: 'Retrieve all conversations for a specific patient' })
  @ApiParam({ name: 'id', type: String, description: 'Patient UUID' })
  @ApiResponse({ status: 200, description: 'List of conversations returned' })
  async getPatientConversations(@Param('id') id: string) {
    return this.patientService.getPatientConversations(id);
  }
}

