// backend/ipfs.js
const pinataSDK = require('@pinata/sdk');
require('dotenv').config();

const pinata = new pinataSDK(
  process.env.PINATA_API_KEY,
  process.env.PINATA_API_SECRET
);

// Function to upload a file to IPFS
async function uploadToIPFS(content) {
  try {
    // Convert content to buffer if it's not already
    const contentBuffer = Buffer.from(JSON.stringify(content));
    
    const options = {
      pinataMetadata: {
        name: `Marine_Report_${Date.now()}`
      }
    };
    
    const result = await pinata.pinJSONToIPFS(content, options);
    return result.IpfsHash; // This is the CID (Content Identifier)
  } catch (error) {
    console.error('IPFS upload error:', error);
    throw new Error('Failed to upload to IPFS');
  }
}

// Function to retrieve a file from IPFS
async function retrieveFromIPFS(cid) {
  try {
    // We can use a public gateway to retrieve the content
    const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
    if (!response.ok) {
      throw new Error(`Failed to retrieve content: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('IPFS retrieval error:', error);
    throw new Error('Failed to retrieve from IPFS');
  }
}

module.exports = {
  uploadToIPFS,
  retrieveFromIPFS
};