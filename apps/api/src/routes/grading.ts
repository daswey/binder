import { Router, Request, Response } from 'express';

const router = Router();

const VERIFY_URLS: Record<string, (cert: string) => string> = {
  PSA: cert => `https://www.psacard.com/cert/${cert}`,
  CGC: cert => `https://www.cgccards.com/certlookup/${cert}`,
  BGS: cert => `https://www.beckett.com/grading/lookup?certNumber=${cert}`,
  ACE: cert => `https://www.acegradings.com/verify?cert=${cert}`,
  SGC: cert => `https://www.gosgc.com/cert/${cert}`,
  TAG: cert => `https://www.taggrading.com/verify/${cert}`,
};

router.get('/verify', (req: Request, res: Response) => {
  const { company, cert } = req.query as Record<string, string>;
  if (!company || !cert) {
    return res.status(400).json({ error: 'BadRequest', message: 'company and cert are required' });
  }
  const urlBuilder = VERIFY_URLS[company.toUpperCase()];
  if (!urlBuilder) {
    return res.status(400).json({ error: 'BadRequest', message: `Unknown grading company: ${company}` });
  }
  return res.json({
    company: company.toUpperCase(),
    cert_number: cert,
    verify_url: urlBuilder(cert),
  });
});

export default router;
