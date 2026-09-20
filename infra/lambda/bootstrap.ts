import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { createProfile } from './auth.js';

export const handler: PostConfirmationTriggerHandler = async event => {
  if (event.triggerSource === 'PostConfirmation_ConfirmSignUp') {
    await createProfile(event.request.userAttributes.sub, event.request.userAttributes);
  }
  return event;
};
