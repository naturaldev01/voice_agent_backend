import { Controller, Get, Param, Query } from '@nestjs/common';
import { PatientService } from './patient.service';

@Controller('patients')
export class PatientController {
  constructor(private patientService: PatientService) {}

  @Get()
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
  async getPatient(@Param('id') id: string) {
    return this.patientService.getPatient(id);
  }

  @Get(':id/conversations')
  async getPatientConversations(@Param('id') id: string) {
    return this.patientService.getPatientConversations(id);
  }
}

