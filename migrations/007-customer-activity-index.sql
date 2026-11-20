CREATE INDEX crm_activities_entity_position ON crm_activities(workspace_id, (payload->>'entityId'), position DESC);
