import { PrismaClient } from '../src/generated/prisma/index.js';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const EXPORT_DIR = path.join(process.cwd(), 'training_data_exports');

// Split ratios
const TRAIN_RATIO = 0.7;
const VAL_RATIO = 0.15;
// TEST_RATIO is the rest (0.15)

// Deterministic split based on string ID to prevent leakage across runs
// Using a simple hash function
function getSplit(id: string): 'train' | 'val' | 'test' {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const normalized = Math.abs(hash) / 2147483648; // 0 to 1
  if (normalized < TRAIN_RATIO) return 'train';
  if (normalized < TRAIN_RATIO + VAL_RATIO) return 'val';
  return 'test';
}

async function exportExtractionData() {
  console.log('Exporting Extraction Data...');
  
  // Find declarations where a human explicitly corrected them OR 
  // where a human explicitly reviewed and approved them.
  // Assuming a Review record or ValidationResult.humanStatus == 'PASS' means approved.
  const declarations = await prisma.declaration.findMany({
    where: {
      OR: [
        { correctedValue: { not: null } },
        // If it wasn't corrected, we only want it if the related validation result was human-reviewed
        {
          results: {
            some: {
              humanStatus: { not: null }
            }
          }
        }
      ]
    },
    include: {
      image: {
        include: {
          ocrResults: { include: { regions: true } }
        }
      },
      results: true
    }
  });

  const streams = {
    train: fs.createWriteStream(path.join(EXPORT_DIR, 'extraction_train.jsonl')),
    val: fs.createWriteStream(path.join(EXPORT_DIR, 'extraction_val.jsonl')),
    test: fs.createWriteStream(path.join(EXPORT_DIR, 'extraction_test.jsonl')),
  };

  let count = 0;
  const fieldStats: Record<string, number> = {};

  for (const decl of declarations) {
    if (!decl.image) continue;
    
    const ocrResult = decl.image.ocrResults[0];
    if (!ocrResult) continue;

    // Ground truth is the corrected value if present, otherwise the AI's normalized value which was human-approved
    const groundTruth = decl.correctedValue || decl.normalizedValue;
    if (!groundTruth) continue;

    // Split based on inspectionId so multiple fields from the same package don't leak across splits
    const split = getSplit(decl.inspectionId);
    
    const dataPoint = {
      inspectionId: decl.inspectionId,
      imageId: decl.imageId,
      declarationId: decl.id,
      field: decl.field,
      rawText: decl.rawText,
      aiPrediction: decl.normalizedValue,
      aiConfidence: decl.extractionConfidence,
      groundTruth: groundTruth,
      isHumanCorrection: !!decl.correctedValue,
      ocrText: ocrResult.fullText,
      ocrConfidence: decl.ocrConfidence,
      regions: ocrResult.regions.map(r => ({
         text: r.text,
         bbox: r.bbox,
         confidence: r.confidence
      }))
    };

    streams[split].write(JSON.stringify(dataPoint) + '\n');
    count++;
    
    fieldStats[decl.field] = (fieldStats[decl.field] || 0) + 1;
  }

  Object.values(streams).forEach(s => s.end());
  
  console.log(`Exported ${count} extraction examples.`);
  console.log('Extraction Field Distribution:', fieldStats);
}

async function exportClassificationData() {
  console.log('\nExporting Classification Data...');
  
  // Only export products where categorySource indicates a human verified it,
  // or we assume any non-null category is verified for now if categorySource isn't strictly enforced yet.
  // For safety, let's just take non-null categories but we'll flag if they lack confidence.
  const products = await prisma.product.findMany({
    where: {
      category: { not: null }
    },
    include: {
      inspections: {
        include: {
          images: {
             include: { ocrResults: true }
          }
        }
      }
    }
  });

  const streams = {
    train: fs.createWriteStream(path.join(EXPORT_DIR, 'classification_train.jsonl')),
    val: fs.createWriteStream(path.join(EXPORT_DIR, 'classification_val.jsonl')),
    test: fs.createWriteStream(path.join(EXPORT_DIR, 'classification_test.jsonl')),
  };

  let count = 0;
  const categoryStats: Record<string, number> = {};

  for (const product of products) {
    if (!product.category) continue;

    // Split based on productId to prevent data leakage
    const split = getSplit(product.id);
    
    // Gather text from all OCR results for this product's inspections
    const allText = product.inspections.flatMap(insp => 
       insp.images.flatMap(img => 
         img.ocrResults.map(res => res.fullText)
       )
    ).join(' '); // Use space instead of newline for flat feature string

    if (!allText.trim()) continue; // Skip if no OCR text available to train on

    const dataPoint = {
      productId: product.id,
      name: product.name,
      brand: product.brand,
      genericName: product.genericName,
      manufacturer: product.manufacturer,
      groundTruthCategory: product.category,
      categoryConfidence: product.categoryConfidence,
      ocrTextFeatures: allText
    };

    streams[split].write(JSON.stringify(dataPoint) + '\n');
    count++;
    
    categoryStats[product.category] = (categoryStats[product.category] || 0) + 1;
  }

  Object.values(streams).forEach(s => s.end());
  console.log(`Exported ${count} classification examples.`);
  console.log('Classification Category Distribution:', categoryStats);
}

async function main() {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR);
  }

  await exportExtractionData();
  await exportClassificationData();
  
  // Save dataset version metadata
  const metadata = {
    version: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(EXPORT_DIR, 'dataset_metadata.json'), JSON.stringify(metadata, null, 2));
  
  console.log(`\nExports complete. Data and metadata saved to ${EXPORT_DIR}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
