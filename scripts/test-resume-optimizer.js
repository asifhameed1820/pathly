const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const { Document, Packer, Paragraph, HeadingLevel } = require('docx');
const { calculateAtsScore } = require('../lib/resumeService');

const BASE_URL = 'http://localhost:3000';

async function generateTestAssets() {
  console.log('\n--- 1. Generating Test Assets ---');

  // 1. Valid PDF Resume
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text('Alex Morgan', 20, 20);
  doc.setFontSize(12);
  doc.text('Frontend Developer | alex.morgan@email.com | +1 555-0199 | San Francisco, CA', 20, 28);
  doc.setFontSize(16);
  doc.text('Professional Summary', 20, 40);
  doc.setFontSize(11);
  doc.text('Performance-focused Frontend Software Engineer with 3+ years experience engineering web apps using React, Next.js, and TypeScript.', 20, 48);
  doc.setFontSize(16);
  doc.text('Technical Skills', 20, 60);
  doc.setFontSize(11);
  doc.text('Languages: JavaScript, TypeScript, HTML5, CSS3, Python', 20, 68);
  doc.text('Frameworks: React, Next.js, Redux Toolkit, Tailwind CSS', 20, 74);
  doc.text('Tools: Git, Jest, Vite, Docker, Webpack, AWS', 20, 80);
  doc.setFontSize(16);
  doc.text('Work Experience', 20, 95);
  doc.setFontSize(12);
  doc.text('Frontend Engineer - TechCorp Global (2022 - Present)', 20, 103);
  doc.setFontSize(10);
  doc.text('- Architected enterprise dashboard components using Next.js, reducing initial load time by 38%.', 20, 110);
  doc.text('- Implemented state management using Redux Toolkit, supporting 50,000+ daily active users.', 20, 116);
  doc.setFontSize(16);
  doc.text('Education', 20, 130);
  doc.setFontSize(11);
  doc.text('B.S. in Computer Science - University of California (2018 - 2022)', 20, 138);

  const pdfBytes = Buffer.from(doc.output('arraybuffer'));
  fs.writeFileSync('test-valid-resume.pdf', pdfBytes);
  console.log('✓ Created test-valid-resume.pdf (' + pdfBytes.length + ' bytes)');

  // 2. Valid DOCX Resume
  const docx = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'Sarah Jenkins', heading: HeadingLevel.TITLE }),
        new Paragraph({ text: 'Full Stack Engineer | sarah.j@example.com | +1 555-0144 | Seattle, WA' }),
        new Paragraph({ text: 'Professional Summary', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'Full Stack Engineer with 4 years experience creating web apps with React, Node.js, and PostgreSQL.' }),
        new Paragraph({ text: 'Technical Skills', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'Languages: JavaScript, TypeScript, Python, SQL. Frameworks: React, Node.js, Express, Next.js. Tools: Docker, AWS, Git.' }),
        new Paragraph({ text: 'Work Experience', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'Senior Software Engineer - CloudScale (2021 - Present)' }),
        new Paragraph({ text: '- Architected distributed microservices handling 2M requests daily, reducing latency by 40%.' }),
        new Paragraph({ text: '- Mentored junior engineers and led code reviews.' }),
        new Paragraph({ text: 'Education', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'B.S. Software Engineering - University of Washington (2017 - 2021)' })
      ]
    }]
  });
  const docxBuffer = await Packer.toBuffer(docx);
  fs.writeFileSync('test-valid-resume.docx', docxBuffer);
  console.log('✓ Created test-valid-resume.docx (' + docxBuffer.length + ' bytes)');

  // 3. Unrelated Document: Chocolate Cake Recipe PDF
  const recipeDoc = new jsPDF();
  recipeDoc.setFontSize(20);
  recipeDoc.text('Grandma Traditional Chocolate Cake Recipe', 20, 20);
  recipeDoc.setFontSize(12);
  recipeDoc.text('Ingredients: 2 cups flour, 1 cup sugar, 1/2 cup cocoa powder, 2 eggs, 1 cup milk, 1 tsp baking powder.', 20, 35);
  recipeDoc.text('Step 1: Preheat oven to 350 degrees F (175 C). Grease and flour a 9x9 inch baking pan.', 20, 50);
  recipeDoc.text('Step 2: In a large bowl, mix together flour, sugar, and cocoa powder.', 20, 60);
  recipeDoc.text('Step 3: Bake for 30 to 35 minutes until a toothpick inserted in center comes out clean.', 20, 70);

  const recipeBytes = Buffer.from(recipeDoc.output('arraybuffer'));
  fs.writeFileSync('test-recipe.pdf', recipeBytes);
  console.log('✓ Created test-recipe.pdf (' + recipeBytes.length + ' bytes)');

  // 4. Empty File (<200 bytes)
  fs.writeFileSync('test-empty.pdf', Buffer.from('%PDF-1.4 empty'));
  console.log('✓ Created test-empty.pdf');

  // 5. Corrupted PDF
  fs.writeFileSync('test-corrupted.pdf', Buffer.from('%PDF-1.7 malformed binary gibberish without xref or trailer data ' + '0'.repeat(300)));
  console.log('✓ Created test-corrupted.pdf');
}

async function runTestSuite() {
  await generateTestAssets();

  console.log('\n============================================================');
  console.log(' PATHLY RESUME OPTIMIZER: AUTOMATED VERIFICATION SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}: ${details}`);
      failed++;
    }
  }

  // --- TEST 1: Valid PDF Resume ---
  try {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync('test-valid-resume.pdf')], { type: 'application/pdf' }), 'test-valid-resume.pdf');
    const res = await fetch(`${BASE_URL}/api/resume/validate`, { method: 'POST', body: form });
    const data = await res.json();
    assert(res.status === 200 && data.isResume === true && data.documentType === 'resume',
      'Test 1: Valid PDF resume accepted', `isResume=${data.isResume}, documentType=${data.documentType}`);
  } catch (err) {
    assert(false, 'Test 1: Valid PDF resume accepted', err.message);
  }

  // --- TEST 2: Valid DOCX Resume ---
  try {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync('test-valid-resume.docx')], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'test-valid-resume.docx');
    const res = await fetch(`${BASE_URL}/api/resume/validate`, { method: 'POST', body: form });
    const data = await res.json();
    assert(res.status === 200 && data.isResume === true && data.documentType === 'resume',
      'Test 2: Valid DOCX resume accepted', `isResume=${data.isResume}, documentType=${data.documentType}`);
  } catch (err) {
    assert(false, 'Test 2: Valid DOCX resume accepted', err.message);
  }

  // --- TEST 3: Logo Image Rejection ---
  try {
    const form = new FormData();
    const imgBuffer = fs.readFileSync('C:/Users/ELCOT/.gemini/antigravity/brain/c1b481ab-445e-4076-897d-bfc1d92c7493/.user_uploaded/media_1794911026662_55ae7368.jpg');
    form.append('file', new Blob([imgBuffer], { type: 'image/jpeg' }), 'guru_ramanam.jpg');
    const res = await fetch(`${BASE_URL}/api/resume/validate`, { method: 'POST', body: form });
    const data = await res.json();
    assert(res.status === 200 && data.isResume === false && data.error === 'Please upload a PDF or DOCX resume.',
      'Test 3: Logo image upload rejected with exact message', `error="${data.error}"`);
  } catch (err) {
    assert(false, 'Test 3: Logo image upload rejected', err.message);
  }

  // --- TEST 4: Spoofed JPG renamed to .pdf (Magic Byte Detection) ---
  try {
    const form = new FormData();
    const imgBuffer = fs.readFileSync('C:/Users/ELCOT/.gemini/antigravity/brain/c1b481ab-445e-4076-897d-bfc1d92c7493/.user_uploaded/media_1794911026662_55ae7368.jpg');
    form.append('file', new Blob([imgBuffer], { type: 'application/pdf' }), 'disguised_logo.pdf');
    const res = await fetch(`${BASE_URL}/api/resume/validate`, { method: 'POST', body: form });
    const data = await res.json();
    assert(res.status === 200 && data.isResume === false && data.reason.includes('image file masquerading'),
      'Test 4: Disguised image (.pdf extension) caught by magic bytes', `reason="${data.reason}"`);
  } catch (err) {
    assert(false, 'Test 4: Disguised image caught by magic bytes', err.message);
  }

  // --- TEST 5: Random Document Rejection (Recipe PDF) ---
  try {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync('test-recipe.pdf')], { type: 'application/pdf' }), 'test-recipe.pdf');
    const res = await fetch(`${BASE_URL}/api/resume/validate`, { method: 'POST', body: form });
    const data = await res.json();
    assert(res.status === 200 && data.isResume === false && data.error === 'This document does not appear to be a resume. Please upload a valid resume.',
      'Test 5: Random document (Recipe) rejected by Gemini classifier', `error="${data.error}", docType="${data.documentType}"`);
  } catch (err) {
    assert(false, 'Test 5: Random document rejection', err.message);
  }

  // --- TEST 6: Empty File Rejection ---
  try {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync('test-empty.pdf')], { type: 'application/pdf' }), 'test-empty.pdf');
    const res = await fetch(`${BASE_URL}/api/resume/validate`, { method: 'POST', body: form });
    const data = await res.json();
    assert(res.status === 200 && data.isResume === false && data.error === "We couldn't extract readable content. Please upload another file.",
      'Test 6: Empty file rejected with exact message', `error="${data.error}"`);
  } catch (err) {
    assert(false, 'Test 6: Empty file rejection', err.message);
  }

  // --- TEST 7: Corrupted Document Rejection ---
  try {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync('test-corrupted.pdf')], { type: 'application/pdf' }), 'test-corrupted.pdf');
    const res = await fetch(`${BASE_URL}/api/resume/validate`, { method: 'POST', body: form });
    const data = await res.json();
    assert(res.status === 200 && data.isResume === false,
      'Test 7: Corrupted unreadable PDF rejected', `isResume=${data.isResume}, error="${data.error}"`);
  } catch (err) {
    assert(false, 'Test 7: Corrupted document rejection', err.message);
  }

  // --- TEST 8: Immediate Processing Stop on Invalid Document in Optimization API ---
  try {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync('test-recipe.pdf')], { type: 'application/pdf' }), 'test-recipe.pdf');
    const res = await fetch(`${BASE_URL}/api/resume/analyze-optimize`, { method: 'POST', body: form });
    const data = await res.json();
    assert(res.status === 400 && data.isResume === false && !data.comparison,
      'Test 8: Immediate stop in optimization API for non-resume (Zero ATS scores generated)', `status=${res.status}`);
  } catch (err) {
    assert(false, 'Test 8: Immediate stop in optimization API', err.message);
  }

  // --- TEST 9: Resume Analysis & Optimization with Gemini ---
  let generatedResumeData = null;
  try {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync('test-valid-resume.pdf')], { type: 'application/pdf' }), 'test-valid-resume.pdf');
    form.append('targetJobDescription', 'Senior Frontend Engineer');
    const res = await fetch(`${BASE_URL}/api/resume/analyze-optimize`, { method: 'POST', body: form });
    const data = await res.json();
    generatedResumeData = data.optimizedResume;
    assert(
      res.status === 200 &&
      data.success === true &&
      data.originalResume.contact.fullName === 'Alex Morgan' &&
      data.comparison.originalScore > 0 &&
      data.comparison.optimizedScore >= data.comparison.originalScore &&
      data.comparison.scoreBreakdown.length === 5,
      'Test 9: Genuine Resume Optimisation & Scoring successful',
      `Original=${data.comparison?.originalScore}, Optimized=${data.comparison?.optimizedScore}`
    );
  } catch (err) {
    assert(false, 'Test 9: Resume Analysis & Optimization', err.message);
  }

  // --- TEST 10: PDF Download Generation ---
  try {
    const res = await fetch(`${BASE_URL}/api/resume/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeData: generatedResumeData, format: 'pdf' })
    });
    const blob = await res.arrayBuffer();
    assert(res.status === 200 && res.headers.get('content-type') === 'application/pdf' && blob.byteLength > 2000,
      'Test 10: PDF download generation matches approved format', `size=${blob.byteLength} bytes`);
  } catch (err) {
    assert(false, 'Test 10: PDF download generation', err.message);
  }

  // --- TEST 11: DOCX Download Generation ---
  try {
    const res = await fetch(`${BASE_URL}/api/resume/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeData: generatedResumeData, format: 'docx' })
    });
    const blob = await res.arrayBuffer();
    assert(
      res.status === 200 &&
      res.headers.get('content-type')?.includes('wordprocessingml') &&
      blob.byteLength > 5000,
      'Test 11: DOCX download generation matches approved format', `size=${blob.byteLength} bytes`);
  } catch (err) {
    assert(false, 'Test 11: DOCX download generation', err.message);
  }

  // --- TEST 12: Resume Editing & Deterministic Re-scoring ---
  try {
    const editedResume = JSON.parse(JSON.stringify(generatedResumeData));
    editedResume.contact.fullName = 'Alex Morgan, Lead Architect';
    editedResume.technicalSkills.languages.push('Rust', 'Go');
    editedResume.experience[0].bullets.push('Architected distributed caching layer saving $120k annually in cloud egress costs.');

    const reEvaluated = calculateAtsScore(editedResume);
    assert(
      typeof reEvaluated.total === 'number' &&
      reEvaluated.total >= 70 &&
      reEvaluated.total <= 100 &&
      reEvaluated.categories.length === 5,
      'Test 12: Resume editing and deterministic re-scoring function works',
      `ReEvaluatedScore=${reEvaluated.total}`
    );
  } catch (err) {
    assert(false, 'Test 12: Resume editing and re-scoring', err.message);
  }

  console.log('\n============================================================');
  console.log(` RESULTS: ${passed} PASSED / ${failed} FAILED (Total: ${passed + failed})`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error during test suite execution:', err);
  process.exit(1);
});
