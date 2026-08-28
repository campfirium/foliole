export function hostedProviderLifecyclePassed(observations) {
  const registration = observations?.registration;
  return registration?.registered === true && registration.cancelled === true && registration.closed === true &&
    registration.error === null && Number.isInteger(registration.port) && registration.port > 0 &&
    typeof registration.runtime_instance_id === 'string' && registration.runtime_instance_id.length > 0 &&
    typeof registration.service_name === 'string' && registration.service_name.startsWith('FolioleHosted-');
}
