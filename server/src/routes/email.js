import {Router} from 'express';
import {auth,role} from '../middleware/auth.js';
import {sendBrevoEmail} from '../services/emailService.js';

const r = Router();

r.post('/test', auth, role('hod'), async (req, res) => {
  try {
    const {toEmail, toName = 'Test Recipient'} = req.body || {};
    if (!toEmail) {
      return res.status(400).json({message:'toEmail is required'});
    }

    const result = await sendBrevoEmail({
      toEmail,
      toName,
      subject: 'Brevo test - Faculty Course Allocation Agent',
      htmlContent: `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>Brevo integration is working</h2>
          <p>This test email was sent by the Faculty Course Allocation Agent backend.</p>
        </div>
      `,
      textContent: 'Brevo integration is working. This test email was sent by the Faculty Course Allocation Agent backend.'
    });

    res.json(result);
  } catch (e) {
    res.status(502).json({ok:false,message:e.message,code:'BREVO_SEND_FAILED'});
  }
});

export default r;
