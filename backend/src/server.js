import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { MongoClient } from 'mongodb';

const app = express();
const port = Number(process.env.PORT || 8787);
const production = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || !production || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS. Add the frontend origin to CORS_ORIGINS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Audio and two image data URLs can be large; keep a bounded request body.
app.use(express.json({ limit: '40mb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }));

let mongoClient;
let casesCollection;
async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.warn('MONGODB_URI not set; case persistence is disabled.'); return; }
  mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await mongoClient.connect();
  const db = mongoClient.db(process.env.MONGODB_DATABASE || 'sketchsense');
  casesCollection = db.collection('cases');
  await casesCollection.createIndex({ caseId: 1 }, { unique: true });
  await casesCollection.createIndex({ updatedAt: -1 });
  console.log(`MongoDB connected (database: ${db.databaseName})`);
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'sketchsense-api', database: Boolean(casesCollection) }));

// Case records are scoped by the supplied case ID. Add authentication/authorization
// before using this API with real sensitive case data in a public deployment.
app.get('/api/cases', async (_req, res) => {
  if (!casesCollection) return res.status(503).json({ error: 'Database is not configured. Set MONGODB_URI in backend/.env.' });
  try {
    const cases = await casesCollection.find({}, { projection: { caseId: 1, caseName: 1, status: 1, updatedAt: 1, _id: 0 } }).sort({ updatedAt: -1 }).limit(200).toArray();
    res.json({ cases });
  } catch (error) { console.error('List cases failed:', error); res.status(500).json({ error: 'Could not load cases.' }); }
});

app.get('/api/cases/:caseId', async (req, res) => {
  if (!casesCollection) return res.status(503).json({ error: 'Database is not configured. Set MONGODB_URI in backend/.env.' });
  try {
    const record = await casesCollection.findOne({ caseId: String(req.params.caseId).slice(0, 120) }, { projection: { _id: 0 } });
    if (!record) return res.status(404).json({ error: 'Case not found.' });
    res.json({ case: record });
  } catch (error) { console.error('Get case failed:', error); res.status(500).json({ error: 'Could not load case.' }); }
});

app.put('/api/cases/:caseId', async (req, res) => {
  if (!casesCollection) return res.status(503).json({ error: 'Database is not configured. Set MONGODB_URI in backend/.env.' });
  const caseId = String(req.params.caseId || '').trim().slice(0, 120);
  if (!caseId) return res.status(400).json({ error: 'Case ID is required.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const record = {
    caseId, caseName: String(body.caseName || caseId).slice(0, 160),
    status: String(body.status || 'In progress').slice(0, 40),
    messages: Array.isArray(body.messages) ? body.messages.slice(-500) : [],
    attributes: Array.isArray(body.attributes) ? body.attributes.slice(0, 100) : [],
    versions: Array.isArray(body.versions) ? body.versions.slice(-100) : [],
    activeVersion: Number.isFinite(body.activeVersion) ? body.activeVersion : 0,
    photo: typeof body.photo === 'string' ? body.photo : '',
    imageOrigin: String(body.imageOrigin || '').slice(0, 40),
    referenceId: String(body.referenceId || '').slice(0, 120),
    referenceEdits: body.referenceEdits && typeof body.referenceEdits === 'object' ? body.referenceEdits : {},
    asked: Array.isArray(body.asked) ? body.asked.slice(0, 100) : [],
    pendingQuestion: String(body.pendingQuestion || 'general').slice(0, 120),
    interviewComplete: body.interviewComplete === true,
    updatedAt: new Date(),
  };
  // Prevent unbounded documents and avoid MongoDB's 16 MB document-limit errors.
  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > 12 * 1024 * 1024) return res.status(413).json({ error: 'This case is too large to store as one record. Reduce embedded image/history data or use object storage for images.' });
  try {
    await casesCollection.updateOne({ caseId }, { $set: record, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
    res.json({ ok: true, caseId, updatedAt: record.updatedAt });
  } catch (error) { console.error('Save case failed:', error); res.status(500).json({ error: 'Could not save case.' }); }
});

function getApiKey(req) {
  const header = req.get('authorization') || '';
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1];
  const supplied = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
  return process.env.OPENAI_API_KEY || bearer || supplied;
}
function requireApiKey(req, res) {
  const key = getApiKey(req);
  if (!key) {
    res.status(400).json({ error: 'An OpenAI API key is required. Add one in the feature settings or configure OPENAI_API_KEY on the backend.' });
    return null;
  }
  return key;
}
function parseDataUrl(value) {
  if (typeof value !== 'string') throw new Error('Image/audio data is missing.');
  const match = value.match(/^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw new Error('Expected a base64 data URL.');
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}
function errorMessage(payload, fallback) {
  return payload?.error?.message || payload?.message || fallback;
}

app.post('/api/transcribe', async (req, res) => {
  const apiKey = requireApiKey(req, res);
  if (!apiKey) return;
  try {
    const { mime, buffer } = parseDataUrl(req.body?.audio);
    if (!mime.startsWith('audio/')) return res.status(400).json({ error: 'The uploaded data is not an audio recording.' });
    if (!buffer.length || buffer.length > 18 * 1024 * 1024) return res.status(413).json({ error: 'Audio must be between 1 byte and 18 MB.' });
    const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm';
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime }), `witness-answer.${ext}`);
    form.append('model', 'whisper-1');
    form.append('response_format', 'json');
    const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(upstream.status === 401 ? 401 : 502).json({ error: errorMessage(data, 'OpenAI transcription failed.') });
    if (!data.text?.trim()) return res.status(422).json({ error: 'No speech was recognized. Try again or type the answer.' });
    return res.json({ text: data.text.trim() });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Could not process the audio recording.' });
  }
});


app.post('/api/extract-attributes', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'LLM extraction is not configured. Set OPENAI_API_KEY in backend/.env; rule-based extraction remains available.' });
  try {
    const transcript = Array.isArray(req.body?.messages)
      ? req.body.messages.filter(x => x && x.role === 'witness' && typeof x.text === 'string').map(x => x.text.trim()).filter(Boolean).join('\n')
      : '';
    if (!transcript) return res.status(400).json({ error: 'At least one witness statement is required.' });
    if (transcript.length > 12000) return res.status(413).json({ error: 'Witness transcript is too long; limit is 12,000 characters.' });
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        attributes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string', enum: ['Age','Face shape','Hair length','Hair texture','Hair color','Eyes','Eyebrows','Nose','Mustache','Beard','Glasses','Scarf'] },
              value: { type: 'string' },
              status: { type: 'string', enum: ['Reported','Uncertain','Missing'] },
              evidence: { type: 'string' }
            },
            required: ['name','value','status','evidence']
          }
        },
        followUpQuestion: { type: ['string','null'] }
      },
      required: ['attributes','followUpQuestion']
    };
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_schema', json_schema: { name: 'witness_attributes', strict: true, schema } },
        messages: [
          { role: 'system', content: 'You structure witness statements for an illustrative facial composite. Never infer appearance from demographic stereotypes. Extract only details explicitly stated. Use Reported for clear statements, Uncertain for hedged/conflicting statements, and Missing with value "Not described" when absent. Keep evidence as a short verbatim supporting phrase or empty string. Ask at most one neutral, non-leading follow-up about the most important missing or uncertain feature. This is not identification.' },
          { role: 'user', content: `Witness statements:\n${transcript}` }
        ]
      })
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(502).json({ error: errorMessage(payload, 'LLM attribute extraction failed.') });
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: 'The LLM returned no structured attributes.' });
    const parsed = JSON.parse(content);
    const allowed = new Set(['Age','Face shape','Hair length','Hair texture','Hair color','Eyes','Eyebrows','Nose','Mustache','Beard','Glasses','Scarf']);
    const attributes = (Array.isArray(parsed.attributes) ? parsed.attributes : []).filter(a => allowed.has(a.name)).map(a => ({
      name: a.name,
      value: a.status === 'Missing' ? 'Not described' : String(a.value || 'Not confirmed').slice(0, 160),
      status: ['Reported','Uncertain','Missing'].includes(a.status) ? a.status : 'Missing',
      evidence: String(a.evidence || '').slice(0, 240)
    }));
    return res.json({ attributes, followUpQuestion: typeof parsed.followUpQuestion === 'string' ? parsed.followUpQuestion.slice(0, 300) : null });
  } catch (error) {
    console.error('Attribute extraction error:', error);
    return res.status(502).json({ error: 'Could not extract structured attributes. Use the rule-based fallback or try again.' });
  }
});

app.post('/api/refine', async (req, res) => {
  const apiKey = requireApiKey(req, res);
  if (!apiKey) return;
  try {
    // Generate from the witness-verified attribute specification, not by editing a
    // fixed reference face. Feeding the same reference image into every request was
    // biasing the output toward the same face and preserving its unwanted features.
    const attributes = Array.isArray(req.body?.attributes) ? req.body.attributes.slice(0, 40) : [];
    const features = Array.isArray(req.body?.features) ? req.body.features.filter(x => typeof x === 'string').slice(0, 40) : [];
    const edits = req.body?.edits && typeof req.body.edits === 'object' ? req.body.edits : {};
    const variation = typeof req.body?.variation === 'string' ? req.body.variation.slice(0, 100) : '';
    const clean = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 160);
    const allowed = new Set(['Age','Face shape','Hair length','Hair texture','Hair color','Eyes','Eyebrows','Nose','Mustache','Beard','Glasses','Scarf']);
    const rows = attributes
      .filter(a => a && allowed.has(a.name))
      .map(a => ({ name: a.name, value: clean(a.value), status: ['Reported','Uncertain','Missing'].includes(a.status) ? a.status : 'Missing' }));
    const reported = rows.filter(a => a.status === 'Reported' && a.value && !/^(not described|unknown|not specified)$/i.test(a.value));
    const uncertain = rows.filter(a => a.status === 'Uncertain' && a.value && !/^(not described|unknown|not specified)$/i.test(a.value));
    if (!reported.length && !features.length) {
      return res.status(400).json({ error: 'Add at least one reported witness attribute before generating a composite.' });
    }
    const editLines = Object.entries(edits).filter(([k, v]) => !k.startsWith('@') && typeof v === 'string' && v.trim()).map(([k, v]) => `${clean(k)}: ${clean(v)}`);
    const prompt = [
      'Generate ONE original, front-facing grayscale pencil facial composite illustration for human review.',
      'This is a new image-generation task, not an image edit. Do not copy a stock face, a reference face, or a prior output. Create a fresh, internally coherent face each time while following the specification below.',
      'Composition: one adult human head and upper neck centered on a plain white paper background, neutral expression, looking straight ahead, evenly lit, clear facial landmarks, realistic pencil/graphite linework, natural anatomy, clean high-resolution details, no color, no text, no labels, no collage, no multiple faces, no dramatic shadows.',
      'ATTRIBUTE RULES: Reported attributes are constraints and should be depicted as accurately as possible. Uncertain attributes must be subtle and should not be treated as confirmed. Missing attributes must not be deliberately added or inferred. Do not infer details from ethnicity, nationality, or stereotypes.',
      'REPORTED ATTRIBUTES:',
      reported.length ? reported.map(a => `- ${a.name}: ${a.value}`).join('\n') : '- No explicit reported attribute list supplied.',
      'UNCERTAIN ATTRIBUTES (do not overstate):',
      uncertain.length ? uncertain.map(a => `- ${a.name}: ${a.value}`).join('\n') : '- None supplied.',
      'OTHER WITNESS-REPORTED DETAILS:',
      features.length ? features.map(clean).join('\n') : '- None.',
      'MANUAL EDITOR SELECTIONS:',
      editLines.length ? editLines.join('\n') : '- None.',
      'Consistency checks: eyes must be aligned and symmetric; nose centered; mouth naturally aligned beneath nose; ears and jaw attached plausibly; hairline must meet forehead naturally; glasses must align with eyes; facial hair must follow the mouth and jaw; no floating or duplicated features.',
      'Forensic integrity: this is an illustrative approximation only. Do not claim identity, certainty, or photographic accuracy.',
      variation ? `Variation note for this request: ${variation}.` : ''
    ].filter(Boolean).join('\n\n');
    const upstream = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5',
        prompt,
        size: '1024x1024',
        quality: 'high',
        n: 1,
        output_format: 'png'
      })
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(upstream.status === 401 ? 401 : 502).json({ error: errorMessage(data, 'OpenAI image generation failed.') });
    const encoded = data?.data?.[0]?.b64_json;
    if (!encoded) return res.status(502).json({ error: 'The image service returned no image. Check model access and API quota, then retry.' });
    return res.json({ image: `data:image/png;base64,${encoded}` });
  } catch (error) {
    console.error('Image generation error:', error);
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Could not generate the composite.' });
  }
});

app.use((err, _req, res, _next) => {
  if (err?.message?.includes('CORS')) return res.status(403).json({ error: err.message });
  console.error('Unhandled API error:', err);
  return res.status(500).json({ error: 'Unexpected server error.' });
});

connectDatabase().catch(error => {
  console.error('MongoDB connection failed:', error.message);
  console.error('API will start, but database-backed case storage will be unavailable until the URI is fixed and the backend restarted.');
});

app.listen(port, () => console.log(`SketchSense API listening on http://localhost:${port}`));
