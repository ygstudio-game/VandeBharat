export const mockTrainSession = {
  id: "INS-2026-0045",
  trainNumber: "VB-22901",
  startedAt: "2026-05-20T20:41:00Z",
  status: "PROCESSING",
  progressPercent: 72,
  stats: {
    totalCoaches: 14,
    framesCaptured: 14221,
    camerasActive: 6,
    criticalDefects: 2,
    ocrConfidence: 0.96,
    synchronizationConfidence: 0.98
  },
  pipelineStates: {
    frameExtraction: "COMPLETED",
    ocrDetection: "COMPLETED",
    synchronization: "IN_PROGRESS",
    componentDetection: "PENDING",
    defectAnalysis: "PENDING",
    reportGeneration: "PENDING"
  }
};

export const mockQueuedSessions = [
  mockTrainSession,
  {
    ...mockTrainSession,
    id: "INS-2026-0046",
    trainNumber: "NDLS-1202",
    status: "COMPLETED",
    progressPercent: 100,
    stats: { ...mockTrainSession.stats, criticalDefects: 0 },
    pipelineStates: {
      frameExtraction: "COMPLETED",
      ocrDetection: "COMPLETED",
      synchronization: "COMPLETED",
      componentDetection: "COMPLETED",
      defectAnalysis: "COMPLETED",
      reportGeneration: "COMPLETED"
    }
  },
  {
    ...mockTrainSession,
    id: "INS-2026-0047",
    trainNumber: "VB-22902",
    status: "QUEUED",
    progressPercent: 0,
    pipelineStates: {
      frameExtraction: "PENDING",
      ocrDetection: "PENDING",
      synchronization: "PENDING",
      componentDetection: "PENDING",
      defectAnalysis: "PENDING",
      reportGeneration: "PENDING"
    }
  }
];

export const mockTrainHierarchy = {
  trainId: "INS-2026-0045",
  coaches: [
    {
      id: "coach-b1",
      coachNumber: "B1",
      stats: {
        ocrFramesCount: 23,
        componentFramesCount: 140,
        criticalDefects: 1,
        missingComponents: 0
      },
      cameras: [
        {
          id: "cam-ocr-01",
          name: "OCR Camera",
          frames: ["frame-url-1", "frame-url-2"]
        },
        {
          id: "cam-left-01",
          name: "Left Assembly Camera",
          frames: ["frame-url-3", "frame-url-4"]
        }
      ]
    }
  ]
};

export const mockComponentIntelligence = {
  coachId: "coach-b1",
  components: [
    {
      id: "comp-001",
      name: "Brake Pad",
      expected: true,
      detected: true,
      status: "OK",
      confidence: 0.99
    },
    {
      id: "comp-002",
      name: "Suspension Pin",
      expected: true,
      detected: false,
      status: "MISSING",
      confidence: 0.0
    }
  ],
  defects: [
    {
      id: "def-001",
      componentId: "comp-001",
      type: "CRACK",
      severity: "CRITICAL",
      frameId: "frame-url-3",
      boundingBox: { x: 120, y: 300, w: 45, h: 60 },
      aiNotes: "Shape mismatch in lower bracket. Crack detected."
    }
  ]
};

export const mockPipelineTimeline = [
  {
    id: "evt-01",
    timestamp: 1234.56,
    type: "OCR_ANCHOR",
    description: "Coach B1 detected",
    frameId: "frame-url-1"
  },
  {
    id: "evt-02",
    timestamp: 1235.12,
    type: "COACH_GAP",
    description: "Inter-coach gap detected",
    frameId: "frame-url-5"
  }
];

export const mockSessions = [
  {
    trainNumber: "V-8892",
    id: "SES-22901-A",
    startedAt: "2026-05-20T08:42:12Z",
    status: "SYNCHRONIZING",
    coachesCount: 18,
    ocrConfidence: 0.984,
    defectsText: "2 CRIT",
    defectsCount: 2,
    severity: "CRITICAL",
    mappedCoaches: 18,
    syncHealth: 0.991,
    mlAccuracy: 0.984
  },
  {
    trainNumber: "V-4421",
    id: "SES-22900-B",
    startedAt: "2026-05-20T07:55:04Z",
    status: "COMPLETED",
    coachesCount: 12,
    ocrConfidence: 0.992,
    defectsText: "None",
    defectsCount: 0,
    severity: "NONE",
    mappedCoaches: 12,
    syncHealth: 0.998,
    mlAccuracy: 0.995
  },
  {
    trainNumber: "V-7710",
    id: "SES-22899-C",
    startedAt: "2026-05-20T06:30:11Z",
    status: "PROCESSING",
    coachesCount: 22,
    ocrConfidence: 0.971,
    defectsText: "1 REV",
    defectsCount: 1,
    severity: "REVIEW",
    mappedCoaches: 20,
    syncHealth: 0.954,
    mlAccuracy: 0.971
  },
  {
    trainNumber: "V-2201",
    id: "SES-22898-D",
    startedAt: "2026-05-19T23:15:00Z",
    status: "COMPLETED",
    coachesCount: 16,
    ocrConfidence: 0.989,
    defectsText: "None",
    defectsCount: 0,
    severity: "NONE",
    mappedCoaches: 16,
    syncHealth: 0.995,
    mlAccuracy: 0.991
  },
  {
    trainNumber: "V-9012",
    id: "SES-22897-E",
    startedAt: "2026-05-19T21:40:22Z",
    status: "FAILED",
    coachesCount: 16,
    ocrConfidence: 0.824,
    defectsText: "5 CRIT",
    defectsCount: 5,
    severity: "CRITICAL",
    mappedCoaches: 14,
    syncHealth: 0.812,
    mlAccuracy: 0.824
  }
];

export const mockReports = [
  {
    id: "REP-2026-0045",
    trainNumber: "VB-22901",
    date: "2026-05-20",
    supervisor: "S. K. Sharma (Senior Section Engineer)",
    status: "PENDING_SIGNATURE",
    criticalDefects: 2,
    minorDefects: 1,
    totalCoaches: 18,
    ocrConf: 0.984,
    syncStability: 0.991,
    verifiedComponentsCount: 140
  },
  {
    id: "REP-2026-0044",
    trainNumber: "NDLS-1202",
    date: "2026-05-20",
    supervisor: "A. K. Mehta (Chief Depot Officer)",
    status: "APPROVED",
    criticalDefects: 0,
    minorDefects: 0,
    totalCoaches: 12,
    ocrConf: 0.992,
    syncStability: 0.998,
    verifiedComponentsCount: 132
  },
  {
    id: "REP-2026-0043",
    trainNumber: "VB-22902",
    date: "2026-05-19",
    supervisor: "R. P. Singh (Depot Supervisor)",
    status: "APPROVED",
    criticalDefects: 0,
    minorDefects: 1,
    totalCoaches: 16,
    ocrConf: 0.989,
    syncStability: 0.995,
    verifiedComponentsCount: 138
  }
];


