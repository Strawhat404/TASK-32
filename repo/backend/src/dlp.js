export const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/;
const MALWARE_SIGNATURES = [
  'EICAR-STANDARD-ANTIVIRUS-TEST-FILE',
  'X5O!P%@AP',
];

export function scanContentForDlp(content) {
  if (SSN_REGEX.test(content)) {
    return { status: 'rejected', reason: 'SSN pattern detected' };
  }
  for (const sig of MALWARE_SIGNATURES) {
    if (content.includes(sig)) {
      return { status: 'quarantined', reason: `malware signature: ${sig}` };
    }
  }
  return { status: 'accepted', reason: 'clean' };
}
