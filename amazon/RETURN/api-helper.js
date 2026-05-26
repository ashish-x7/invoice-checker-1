export async function getGeminiResponse(apiKey, invoicePdfData, portalPdfData) {
    const cleanApiKey = apiKey.trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleanApiKey}`;

    const prompt = `
    Task: Audit these two PDF documents. Match these 4 fields:
    1. System Ref No vs Invoice No
    2. Invoice Number vs GST Invoice No
    3. GSTIN vs GSTIN Number
    4. Total Amount vs Total Invoice Amount

    Return JSON ONLY:
    {
        "auditData": [
            {"field": "System Ref / Invoice No", "pdf1Value": "...", "pdf2Value": "...", "status": true},
            {"field": "Invoice Number", "pdf1Value": "...", "pdf2Value": "...", "status": true},
            {"field": "GSTIN", "pdf1Value": "...", "pdf2Value": "...", "status": true},
            {"field": "Total Amount", "pdf1Value": "...", "pdf2Value": "...", "status": true}
        ],
        "partyCode": "Extract only the 3 or 4 digit middle code from PDF 1's 'Vendor Invoice No' (e.g. from CB26S285-56, extract 285). Return 'N/A' if not found.",
        "verificationReport": "..."
    }
    `;

    const contents = [
        {
            role: "user",
            parts: [
                { text: prompt },
                {
                    inline_data: {
                        mime_type: "application/pdf",
                        data: invoicePdfData
                    }
                },
                {
                    inline_data: {
                        mime_type: "application/pdf",
                        data: portalPdfData
                    }
                }
            ]
        }
    ];

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents,
                generationConfig: {
                    temperature: 0.1,
                    topP: 0.1
                }
            })
        });

        const data = await response.json();
        console.log("Full Gemini API Response:", JSON.stringify(data, null, 2));
        
        if (data.error) {
            console.error("Gemini API detailed error:", JSON.stringify(data.error, null, 2));
            throw new Error(data.error.message || JSON.stringify(data.error));
        }

        const textResponse = data.candidates[0].content.parts[0].text;
        const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { verificationReport: "Error parsing AI response" };

    } catch (error) {
        console.error("Gemini API Error:", error);
        throw error;
    }
}

export function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
    });
}
