require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const allDetections = await prisma.componentDetection.count();
  const allDefects = await prisma.defect.count();
  const allMissing = await prisma.missingComponent.count();
  const allOcr = await prisma.ocrResult.count();
  const allFrames = await prisma.frame.count();
  const allCoaches = await prisma.coach.count();
  
  console.log('Database total records:');
  console.log(`- Coaches: ${allCoaches}`);
  console.log(`- Frames: ${allFrames}`);
  console.log(`- OCR Results: ${allOcr}`);
  console.log(`- Component Detections: ${allDetections}`);
  console.log(`- Defects: ${allDefects}`);
  console.log(`- Missing Components: ${allMissing}`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
