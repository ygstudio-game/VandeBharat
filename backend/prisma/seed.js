const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Default admin account for local testing — change DEV_ADMIN_PASSWORD in
  // a real environment, never rely on this default outside dev.
  const adminPassword = process.env.DEV_ADMIN_PASSWORD || 'ChangeMe123!';
  await prisma.user.upsert({
    where: { email: 'admin@vande.local' },
    update: {},
    create: {
      email: 'admin@vande.local',
      name: 'Default Admin',
      role: 'admin',
      password_hash: await bcrypt.hash(adminPassword, 10),
      is_active: true,
    },
  });
  // Default camera setup for MVP / testing
  const setup = await prisma.cameraSetup.upsert({
    where: { station_code: 'TEST01' },
    update: {},
    create: {
      station_name: 'Test Station — MVP',
      station_code: 'TEST01',
      is_active: true,
    },
  });

  // Fixed physical camera registry — 10 cameras per station.
  // 2 OCR + 2 each of Left-Bottom / Left-Top / Right-Bottom / Right-Top.
  const FIXED_CAMERAS = [
    { camera_code: 'OCR-1',  camera_type: 'ocr',       position_label: 'OCR / Placard Camera 1' },
    { camera_code: 'OCR-2',  camera_type: 'ocr',       position_label: 'OCR / Placard Camera 2' },
    { camera_code: 'CL-B-1', camera_type: 'component', position_label: 'Component Left Bottom 1' },
    { camera_code: 'CL-B-2', camera_type: 'component', position_label: 'Component Left Bottom 2' },
    { camera_code: 'CL-T-1', camera_type: 'component', position_label: 'Component Left Top 1' },
    { camera_code: 'CL-T-2', camera_type: 'component', position_label: 'Component Left Top 2' },
    { camera_code: 'CR-B-1', camera_type: 'component', position_label: 'Component Right Bottom 1' },
    { camera_code: 'CR-B-2', camera_type: 'component', position_label: 'Component Right Bottom 2' },
    { camera_code: 'CR-T-1', camera_type: 'component', position_label: 'Component Right Top 1' },
    { camera_code: 'CR-T-2', camera_type: 'component', position_label: 'Component Right Top 2' },
  ];
  for (const c of FIXED_CAMERAS) {
    const exists = await prisma.camera.findFirst({
      where: { camera_setup_id: setup.id, camera_code: c.camera_code },
    });
    if (!exists) {
      await prisma.camera.create({ data: { ...c, camera_setup_id: setup.id, is_active: true } });
    }
  }

  const manifests = [
    { coach_type: 'VANDE_BHARAT', component_name: 'Brake Pad',       component_code: 'BRAKE_PAD',   quantity: 2, is_critical: true },
    { coach_type: 'VANDE_BHARAT', component_name: 'Suspension Pin',   component_code: 'SUSP_PIN',    quantity: 4, is_critical: true },
    { coach_type: 'VANDE_BHARAT', component_name: 'Water Tank',       component_code: 'WATER_TANK',  quantity: 1, is_critical: false },
    { coach_type: 'VANDE_BHARAT', component_name: 'Axle Box Cover',   component_code: 'AXLE_BOX',    quantity: 4, is_critical: true },
    { coach_type: 'VANDE_BHARAT', component_name: 'Wheel Assembly',   component_code: 'WHEEL_ASSY',  quantity: 4, is_critical: true },
    { coach_type: 'VANDE_BHARAT', component_name: 'Coupler',          component_code: 'COUPLER',     quantity: 2, is_critical: true },
    { coach_type: 'VANDE_BHARAT', component_name: 'Bogie Frame',      component_code: 'BOGIE_FRAME', quantity: 2, is_critical: true },
    { coach_type: 'LHB_SLEEPER',  component_name: 'Brake Pad',        component_code: 'BRAKE_PAD',   quantity: 2, is_critical: true },
    { coach_type: 'LHB_SLEEPER',  component_name: 'Primary Suspension',   component_code: 'PRI_SUSP',      quantity: 4, is_critical: true },
    { coach_type: 'LHB_SLEEPER',  component_name: 'Secondary Suspension', component_code: 'SEC_SUSP',      quantity: 4, is_critical: true },
    { coach_type: 'LHB_SLEEPER',  component_name: 'Axle Box Cover',   component_code: 'AXLE_BOX',    quantity: 4, is_critical: true },
    { coach_type: 'LHB_SLEEPER',  component_name: 'Wheel Assembly',   component_code: 'WHEEL_ASSY',  quantity: 4, is_critical: true },
    { coach_type: 'LHB_SLEEPER',  component_name: 'Centre Pivot Pin', component_code: 'CENTRE_PIVOT', quantity: 1, is_critical: true },
    { coach_type: 'LHB_SLEEPER',  component_name: 'Coupler',          component_code: 'COUPLER',     quantity: 2, is_critical: true },
  ];

  for (const m of manifests) {
    await prisma.componentManifest.upsert({
      where: { coach_type_component_code: { coach_type: m.coach_type, component_code: m.component_code } },
      update: {},
      create: m,
    });
  }

  console.log('Seed complete: admin@vande.local + camera_setup TEST01 + 10 fixed cameras + 14 component manifests');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
