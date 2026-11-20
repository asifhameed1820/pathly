const fs = require('fs');
const { Document, Packer, Paragraph, HeadingLevel } = require('docx');

const BASE_URL = 'http://localhost:3000';

async function testYaswanthResume() {
  console.log('\n--- 1. Creating Yaswanth Kumar DOCX resume ---');

  const docx = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'YASWANTH KUMAR', heading: HeadingLevel.TITLE }),
        new Paragraph({ text: 'Salem, Tamil Nadu | +91 96004 59405 | yaswanth0411@gmail.com | linkedin.com/in/yaswanthkumar0411 | github.com/Yaswanthkumar04' }),
        new Paragraph({ text: 'CAREER OBJECTIVE', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'Seeking an entry-level Cloud/Network Administrator role, applying hands-on training in AWS infrastructure (EC2, S3, IAM, VPC), network topology design and routing/switching in Cisco Packet Tracer, and Linux systems administration to support enterprise IT operations.' }),
        new Paragraph({ text: 'EDUCATION', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'B.Tech, Information Technology - Dhirajlal Gandhi College of Technology, Salem, Tamil Nadu' }),
        new Paragraph({ text: 'TECHNICAL SKILLS', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'Cloud: AWS EC2, S3, IAM, VPC, shared responsibility model, AWS pricing & billing' }),
        new Paragraph({ text: 'Networking: IP addressing, subnetting, routing & switching, DNS, VPN and firewall fundamentals, Cisco Packet Tracer' }),
        new Paragraph({ text: 'Operating Systems & Tools: Linux administration, Windows Server, Python, Java, Git, Boto3, Wireshark' }),
        new Paragraph({ text: 'CERTIFICATIONS', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'Cybersecurity Basics, Cybrary - Jul 2026' }),
        new Paragraph({ text: 'AWS Cloud Practitioner Essentials - Amazon Web Services (2026): cloud architecture, IAM, security' }),
        new Paragraph({ text: 'Getting Started with Cisco Packet Tracer - Cisco (2026): network topology design, routing, switching' }),
        new Paragraph({ text: 'INTERNSHIP & VIRTUAL EXPERIENCE', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'Cybersecurity Job Simulation, Deloitte (Forage)' }),
        new Paragraph({ text: '- Analyzed simulated enterprise security logs to identify indicators of compromise and documented findings using structured SOC analysis.' }),
        new Paragraph({ text: 'Cybersecurity Job Simulation, Mastercard (Forage)' }),
        new Paragraph({ text: '- Designed phishing simulation campaigns and social engineering attack scenarios to evaluate organizational security awareness.' })
      ]
    }]
  });

  const docxBuffer = await Packer.toBuffer(docx);
  fs.writeFileSync('test-yaswanth-resume.docx', docxBuffer);
  console.log('✓ Created test-yaswanth-resume.docx (' + docxBuffer.length + ' bytes)');

  console.log('\n--- 2. Sending to /api/resume/analyze-optimize ---');
  const form = new FormData();
  form.append('file', new Blob([docxBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'YaswanthKumar_Resume word.docx');
  form.append('targetJobDescription', 'Cloud/Network Administrator');

  const res = await fetch(`${BASE_URL}/api/resume/analyze-optimize`, {
    method: 'POST',
    body: form
  });

  const data = await res.json();
  console.log('Status:', res.status);

  if (!res.ok) {
    console.error('FAILED:', data);
    process.exit(1);
  }

  console.log('\n--- 3. Verifying Extracted & Optimized Resume ---');
  console.log('Candidate Full Name:', data.originalResume?.contact?.fullName);
  console.log('Candidate Email:', data.originalResume?.contact?.email);
  console.log('Candidate Phone:', data.originalResume?.contact?.phone);
  console.log('Candidate Location:', data.originalResume?.contact?.location);
  console.log('Candidate Title:', data.optimizedResume?.contact?.professionalTitle);
  console.log('Original ATS Score:', data.comparison?.originalScore);
  console.log('Optimized ATS Score:', data.comparison?.optimizedScore);
  console.log('Skills Tools & Cloud:', data.optimizedResume?.technicalSkills?.toolsAndCloud);
  console.log('Experience Companies:', data.optimizedResume?.experience?.map(e => `${e.role} @ ${e.company}`));
  console.log('Education:', data.optimizedResume?.education?.map(e => `${e.degree} - ${e.institution}`));

  const isNameCorrect = data.originalResume?.contact?.fullName?.toLowerCase().includes('yaswanth');
  const isEmailCorrect = data.originalResume?.contact?.email?.includes('yaswanth0411@gmail.com');
  const hasCloudSkills = data.optimizedResume?.technicalSkills?.toolsAndCloud?.some(s => s.toLowerCase().includes('aws') || s.toLowerCase().includes('cisco') || s.toLowerCase().includes('ec2'));

  console.log('\n--- VERIFICATION CHECKS ---');
  console.log('1. Candidate Name is Yaswanth Kumar:', isNameCorrect ? 'PASS' : 'FAIL');
  console.log('2. Candidate Email is yaswanth0411@gmail.com:', isEmailCorrect ? 'PASS' : 'FAIL');
  console.log('3. Preserved Real Cloud/Network Skills:', hasCloudSkills ? 'PASS' : 'FAIL');

  if (isNameCorrect && isEmailCorrect) {
    console.log('\n SUCCESS: Real candidate data preserved and optimized accurately!');
  } else {
    console.error('\n FAILED: Did not match candidate name/email');
    process.exit(1);
  }
}

testYaswanthResume().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
