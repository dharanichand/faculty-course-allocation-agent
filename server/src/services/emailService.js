const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

function configured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}

export async function sendBrevoEmail({
  toEmail,
  toName = '',
  subject,
  htmlContent,
  textContent
}) {
  if (!configured()) {
    return {
      ok: false,
      skipped: true,
      reason: 'Brevo is not configured. Set BREVO_API_KEY and BREVO_SENDER_EMAIL.'
    };
  }

  if (!toEmail || !subject) {
    throw new Error('Recipient email and subject are required.');
  }

  const response = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME || 'Faculty Course Allocation Agent',
        email: process.env.BREVO_SENDER_EMAIL
      },
      to: [{
        email: toEmail,
        ...(toName ? { name: toName } : {})
      }],
      subject,
      ...(htmlContent ? { htmlContent } : {}),
      ...(textContent ? { textContent } : {})
    })
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = body?.message || `Brevo returned HTTP ${response.status}`;
    throw new Error(`Brevo email failed: ${message}`);
  }

  return {
    ok: true,
    messageId: body?.messageId || null
  };
}

export async function sendWelcomeEmail(user) {
  return sendBrevoEmail({
    toEmail: user.email,
    toName: user.name,
    subject: 'Welcome to Faculty Course Allocation Agent',
    htmlContent: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:620px;margin:auto">
        <h2 style="color:#1d4ed8">Welcome, ${escapeHtml(user.name || 'User')}!</h2>
        <p>Your Faculty Course Allocation Agent account has been created successfully.</p>
        <p><strong>Role:</strong> ${escapeHtml(user.role || 'faculty')}</p>
        ${user.facultyId ? `<p><strong>Faculty ID:</strong> ${escapeHtml(user.facultyId)}</p>` : ''}
        <p>You can now sign in and use the allocation dashboard.</p>
        <p style="color:#64748b">This is an automated message from the Faculty Course Allocation Agent.</p>
      </div>
    `,
    textContent: `Welcome ${user.name || 'User'}! Your Faculty Course Allocation Agent account has been created successfully.`
  });
}

export async function sendAllocationDecisionEmail({
  email,
  name,
  courseId,
  courseName,
  decision,
  reason = ''
}) {
  const approved = decision === 'approved';
  const subject = approved
    ? `Course allocation approved: ${courseId}`
    : `Course allocation update: ${courseId}`;

  return sendBrevoEmail({
    toEmail: email,
    toName: name,
    subject,
    htmlContent: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:620px;margin:auto">
        <h2 style="color:${approved ? '#15803d' : '#b91c1c'}">
          Course Allocation ${approved ? 'Approved' : 'Rejected'}
        </h2>
        <p>Hello ${escapeHtml(name || 'Faculty Member')},</p>
        <p>Your course allocation request has been <strong>${approved ? 'approved' : 'rejected'}</strong> by the HOD.</p>
        <p><strong>Course:</strong> ${escapeHtml(courseId || '')} — ${escapeHtml(courseName || '')}</p>
        ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
        <p style="color:#64748b">This is an automated message from the Faculty Course Allocation Agent.</p>
      </div>
    `,
    textContent: `Your course allocation request for ${courseId} - ${courseName} was ${approved ? 'approved' : 'rejected'} by the HOD.${reason ? ` Reason: ${reason}` : ''}`
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
