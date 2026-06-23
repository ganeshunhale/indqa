/**
 * Seed script: populates the IndQA knowledge base with sample passages and their
 * Gemini embeddings.  Run:  npm run seed   (or: node seed.js)
 *
 * Idempotent: passages are keyed by their text, so re-running does NOT wipe the
 * collection or create duplicates. Passages that already have an embedding are
 * skipped, so re-runs are cheap and don't burn Gemini quota.
 */
import mongoose from 'mongoose';
import config from './config/index.js';
import { generateEmbedding } from './services/gemini.js';
import KnowledgeChunk from './models/KnowledgeChunk.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sample knowledge base entries (government programs, education, health, agriculture, general).
const sampleKnowledge = [
  { text: 'Pradhan Mantri Jan Dhan Yojana (PMJDY) is a national financial inclusion mission launched on 28 August 2014. It provides universal access to banking facilities with at least one basic banking account for every household, financial literacy, access to credit, insurance, and pension.', source: 'Ministry of Finance, Government of India', category: 'government' },
  { text: 'Ayushman Bharat Pradhan Mantri Jan Arogya Yojana (AB PM-JAY) is the largest health assurance scheme in the world. It provides health cover of Rs. 5 lakh per family per year for secondary and tertiary care hospitalization to over 12 crore poor and vulnerable families.', source: 'National Health Authority, Government of India', category: 'health' },
  { text: 'The PM-KISAN scheme provides income support of Rs. 6,000 per year in three equal installments to all landholding farmer families. The fund is directly transferred to the bank accounts of the beneficiaries. Over 11 crore farmers have benefited from this scheme.', source: 'Ministry of Agriculture, Government of India', category: 'agriculture' },
  { text: 'The Right to Education Act 2009 mandates free and compulsory education for every child between the ages of 6 and 14 in India. It specifies minimum norms for schools including pupil-teacher ratios, building infrastructure, and the number of school working days.', source: 'Ministry of Education, Government of India', category: 'education' },
  { text: 'Swachh Bharat Mission was launched on 2 October 2014 to accelerate the efforts to achieve universal sanitation coverage in India. The mission aims to eliminate open defecation by constructing household toilets, community and public toilets, and establishing waste management systems.', source: 'Ministry of Housing and Urban Affairs, Government of India', category: 'government' },
  { text: 'The Mahatma Gandhi National Rural Employment Guarantee Act (MGNREGA) guarantees 100 days of wage employment in a financial year to every rural household whose adult members volunteer to do unskilled manual work. The wage rate is notified by the central government.', source: 'Ministry of Rural Development, Government of India', category: 'government' },
  { text: 'Digital India is a flagship programme launched on 1 July 2015 to transform India into a digitally empowered society and knowledge economy. The three key vision areas are digital infrastructure as a utility, governance and services on demand, and digital empowerment of citizens.', source: 'Ministry of Electronics and IT, Government of India', category: 'government' },
  { text: 'The National Education Policy 2020 aims to overhaul the Indian education system by 2040. Key features include universal access to quality early childhood care and education, a 5+3+3+4 curricular structure, multidisciplinary institutions, and achieving a GER of 50% in higher education by 2035.', source: 'Ministry of Education, Government of India', category: 'education' },
  { text: 'Soil Health Card scheme provides soil health cards to farmers across the country. The card carries crop-wise recommendations of nutrients and fertilizers required for individual farms. It helps farmers improve productivity through judicious use of soil nutrients.', source: 'Ministry of Agriculture, Government of India', category: 'agriculture' },
  { text: 'The Unified Payments Interface (UPI) is a real-time payment system developed by the National Payments Corporation of India. UPI processed over 13 billion transactions worth over Rs. 20 lakh crore in a single month in 2024, making it the most popular digital payment method in India.', source: 'National Payments Corporation of India', category: 'general' },
  { text: 'Bhashini is the National Language Translation Mission launched by the Ministry of Electronics and IT in July 2022. It provides AI-powered translation and speech recognition services for all 22 scheduled Indian languages. The platform hosts over 1,000 pretrained models and processes more than 100 million inference requests monthly.', source: 'Ministry of Electronics and IT, Government of India', category: 'government' },
  { text: 'The Startup India initiative was launched on 16 January 2016 to build a strong ecosystem for startups in India. It offers tax exemptions for three consecutive years, a self-certification compliance regime, easy access to funds through a Fund of Funds, and simplified regulations.', source: 'Department for Promotion of Industry and Internal Trade, Government of India', category: 'general' },
  { text: 'Pradhan Mantri Fasal Bima Yojana (PMFBY) provides comprehensive insurance coverage against crop loss due to natural calamities, pests, and diseases. Farmers pay only 2% premium for Kharif crops, 1.5% for Rabi crops, and 5% for commercial crops. The balance premium is shared between central and state governments.', source: 'Ministry of Agriculture, Government of India', category: 'agriculture' },
  { text: 'The Indian Space Research Organisation (ISRO) successfully completed the Chandrayaan-3 mission on 23 August 2023, making India the fourth country to land on the Moon and the first to land near the lunar south pole. The Vikram lander and Pragyan rover operated on the lunar surface for one lunar day.', source: 'ISRO, Government of India', category: 'general' },
  { text: 'Aadhaar is a 12-digit unique identification number issued by the Unique Identification Authority of India (UIDAI). As of 2024, over 138 crore Aadhaar numbers have been issued, covering over 99% of the adult population. It serves as the foundation for Direct Benefit Transfer and various e-governance services.', source: 'UIDAI, Government of India', category: 'government' },
  { text: 'The National Health Mission includes Ayushman Bharat Health and Wellness Centres (AB-HWC) that provide comprehensive primary healthcare including maternal and child health, non-communicable diseases, free essential drugs and diagnostics. Over 1.6 lakh HWCs have been operational as of 2024.', source: 'Ministry of Health and Family Welfare, Government of India', category: 'health' },
  { text: 'Kisan Credit Card (KCC) scheme provides short-term credit at subsidized interest rates to farmers for their cultivation needs. The interest rate is 4% per annum after interest subvention for prompt repayment. KCC also covers post-harvest expenses, produce marketing, and allied activities.', source: 'Ministry of Agriculture, Government of India', category: 'agriculture' },
  { text: 'The Goods and Services Tax (GST) was introduced in India on 1 July 2017, replacing multiple indirect taxes with a unified tax structure. The four main GST slabs are 5%, 12%, 18%, and 28%. Essential items like food grains are exempt. GST has simplified the tax structure and expanded the tax base.', source: 'Ministry of Finance, Government of India', category: 'general' },
  { text: 'Jal Jeevan Mission aims to provide functional household tap connection to every rural household in India by 2024. The mission ensures potable water supply in adequate quantity of prescribed quality on a regular and long-term basis. Over 14 crore households have been provided tap water connections.', source: 'Ministry of Jal Shakti, Government of India', category: 'government' },
  { text: 'The Indian Institutes of Technology (IITs) are autonomous public technical universities established by an Act of Parliament. There are 23 IITs across India. Admission to undergraduate programs is through JEE Advanced, one of the most competitive entrance examinations in the world.', source: 'Ministry of Education, Government of India', category: 'education' },

  // --- Additional entries for a richer demo ---
  { text: 'Pradhan Mantri Ujjwala Yojana (PMUY) was launched on 1 May 2016 to provide free LPG connections to women from below-poverty-line households. It aims to safeguard the health of women and children by providing clean cooking fuel and reducing dependence on firewood. Over 10 crore connections have been released.', source: 'Ministry of Petroleum and Natural Gas, Government of India', category: 'government' },
  { text: 'Sukanya Samriddhi Yojana is a small-deposit savings scheme for the girl child launched as part of the Beti Bachao Beti Padhao campaign. A guardian can open the account for a girl below 10 years of age. It offers an attractive interest rate and income-tax benefits under Section 80C.', source: 'Ministry of Finance, Government of India', category: 'government' },
  { text: 'Atal Pension Yojana (APY) is a guaranteed pension scheme for workers in the unorganised sector. Subscribers between 18 and 40 years receive a guaranteed monthly pension of Rs. 1,000 to Rs. 5,000 after the age of 60, depending on their contributions.', source: 'Pension Fund Regulatory and Development Authority', category: 'government' },
  { text: 'Pradhan Mantri Awas Yojana (PMAY) aims to provide affordable housing with the goal of Housing for All. It has urban (PMAY-U) and rural (PMAY-G) components and provides credit-linked interest subsidy on home loans. Crores of pucca houses with basic amenities have been sanctioned.', source: 'Ministry of Housing and Urban Affairs, Government of India', category: 'government' },
  { text: 'Skill India Mission, launched in 2015, includes the Pradhan Mantri Kaushal Vikas Yojana (PMKVY) which provides short-term skill training and certification to youth. The mission aims to train crores of people in industry-relevant skills to improve employability.', source: 'Ministry of Skill Development and Entrepreneurship, Government of India', category: 'education' },
  { text: 'The e-Shram portal is a national database of unorganised workers launched in August 2021. Workers receive a Universal Account Number (UAN) and a Shram card, enabling access to social security and welfare schemes. Over 29 crore workers have registered.', source: 'Ministry of Labour and Employment, Government of India', category: 'government' },
  { text: 'The Ayushman Bharat Digital Mission (ABDM) aims to create a digital health ecosystem. Citizens can create an ABHA (Ayushman Bharat Health Account) number to link and access their digital health records securely across hospitals and clinics.', source: 'National Health Authority, Government of India', category: 'health' },
  { text: 'One Nation One Ration Card (ONORC) allows beneficiaries under the National Food Security Act to access subsidised food grains from any Fair Price Shop anywhere in the country using their existing ration card. It benefits migrant workers and their families.', source: 'Ministry of Consumer Affairs, Food and Public Distribution, Government of India', category: 'government' },
  { text: 'PM POSHAN (formerly the Mid-Day Meal Scheme) provides a hot cooked meal to children in government and government-aided schools from classes 1 to 8. It aims to improve nutritional levels and encourage school attendance among children.', source: 'Ministry of Education, Government of India', category: 'education' },
  { text: 'The National Pension System (NPS) is a voluntary, defined-contribution retirement savings scheme regulated by PFRDA. It allows subscribers to make regular contributions during their working life and offers market-linked returns along with tax benefits.', source: 'Pension Fund Regulatory and Development Authority', category: 'general' },
];

async function seed() {
  let added = 0;
  let skipped = 0;
  try {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to MongoDB Atlas');

    for (const item of sampleKnowledge) {
      const existing = await KnowledgeChunk.findOne({ text: item.text });
      if (existing?.embedding?.length) {
        skipped++;
        continue;
      }

      console.log(`Embedding: ${item.text.slice(0, 60)}...`);
      const embedding = await generateEmbedding(item.text);

      await KnowledgeChunk.updateOne(
        { text: item.text },
        {
          $set: {
            textEnglish: item.text,
            source: item.source,
            category: item.category,
            language: 'en',
            embedding,
            metadata: { title: item.source, dateAdded: new Date() },
          },
        },
        { upsert: true }
      );
      added++;
      await sleep(200); // be gentle with rate limits
    }

    console.log(`\nSeed complete. Added/updated: ${added}, skipped (already embedded): ${skipped}.`);
    console.log('\nIMPORTANT: Ensure an Atlas Vector Search index named "embedding_index" exists:');
    console.log('  Collection: knowledgechunks | Field: embedding | Dimensions: 768 | Similarity: cosine');

    await mongoose.disconnect();
    console.log('\nDone!');
  } catch (error) {
    console.error('Seed error:', error.message);
    process.exit(1);
  }
}

seed();
