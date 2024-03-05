// MoMo (Mobile Money) API Server for MTN's Collection Product Service
// This server handles various endpoints to interact with the MTN MoMo API, 
// facilitating operations like user creation, token generation, and payment requests.

const express = require('express');
const axios = require('axios');
require('dotenv').config();  // Load environment variables from .env file
const bodyParser = require('body-parser');  // Parse incoming request bodies
const cors = require('cors');  // Enable Cross-Origin Resource Sharing for all routes
const { v4: uuidv4 } = require('uuid');  // UUID generation for unique identifiers

const app = express();
const port = 3001; // Server listening port, can be set to any preferred available port

// Middleware configuration
app.use(bodyParser.json());  // Support for JSON-encoded bodies
app.use(cors());  // Apply CORS to all routes for wider accessibility

// MoMo API configuration
const momoHost = 'sandbox.momodeveloper.mtn.com';  // MoMo API host
const momoTokenUrl = `https://${momoHost}/collection/token/`;  // Token endpoint
const momoRequestToPayUrl = `https://${momoHost}/collection/v1_0/requesttopay`;  // Request to Pay endpoint
const MOMO_SUBSCRIPTION_KEY = process.env.MOMO_SUBSCRIPTION_KEY; //Subscription key (Primary  or Secondary key) for MoMo API, ideally stored in .env file. 

// Home route - Simple check to confirm the server is running
app.get('/', (req, res) => {
    res.send('MoMo API Server is up and running!');
});

// Endpoint: Create MoMo API User
// This endpoint creates a new API user and returns the user ID (X-Reference-Id).
// This user ID is essential for further actions like retrieving the API key.
app.post('/create-api-user', async (req, res) => {

    const apiUrl = `https://${momoHost}/v1_0/apiuser`;

    // UUID generation for use in API calls where a unique identifier is required
    let uuid = uuidv4();

    // Headers for the MoMo API request
    const headers = {
        'X-Reference-Id': uuid,
        'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY,
        'Content-Type': 'application/json'
    };
    // Data payload for the API request
    const data = {
        providerCallbackHost: 'https://525e-41-210-145-67.ngrok-free.app'  // replace with your Callback url
    };

    try {
        const response = await axios.post(apiUrl, data, { headers: headers });
        res.status(200).json({ response: response.data, userId: uuid });  // Returns the response from MoMo API along with the generated userId
    } catch (error) {
        res.status(500).json({ message: 'Error creating API user', error: error.message });
    }
});

// Endpoint: Get Created User by User ID
// This endpoint retrieves details of a created user using their user ID.
// It's useful for validating that a user has been created successfully.
app.get('/get-created-user/:userId', async (req, res) => {
    const userId = req.params.userId;
    const apiUrl = `https://${momoHost}/v1_0/apiuser/${userId}`;
    const headers = {
        'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY
    };

    try {
        const response = await axios.get(apiUrl, { headers: headers });
        res.status(200).json(response.data);  // Successful retrieval returns user details
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving created user', error: error.message });
    }
});

// Endpoint: Retrieve User API Key
// This endpoint retrieves the API key for a specific user, which is used as the password
// in user authentication when generating a MoMo token.
app.post('/retrieve-api-key/:userId', async (req, res) => {
    const userId = req.params.userId;
    const apiUrl = `https://${momoHost}/v1_0/apiuser/${userId}/apikey`;
    const headers = {
        'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY
    };

    try {
        const response = await axios.post(apiUrl, {}, { headers: headers });
        res.status(200).json(response.data);  // Returns the user's API key
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving API key', error: error.message });
    }
});

// Endpoint: Generate MoMo Token
// This endpoint generates a token used for authorizing payment requests.
// The token is essential for making requests to the `/request-to-pay` endpoint.
app.post('/generate-api-token', async (req, res) => {
    const apiUrl = momoTokenUrl;
    console.log('Token request details:', req.body);
    const { userId, apiKey } = req.body;
    const username = userId;  // Username (X-Reference-Id) from user creation step
    const password = apiKey;  // API Key retrieved from user API key step
    const basicAuth = 'Basic ' + btoa(username + ':' + password);  // Basic Auth header
    const headers = {
        'Authorization': basicAuth,
        'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY
    };

    try {
        const response = await axios.post(apiUrl, {}, { headers: headers });
        res.status(200).json(response.data);  // Returns the generated token
    } catch (error) {
        res.status(500).json({ message: 'Error generating API token', error: error.message });
    }
});

// Endpoint: Request to Pay
// This endpoint initiates a payment request to a specified mobile number.
// It requires a valid MoMo token and transaction details.
app.post('/request-to-pay', async (req, res) => {
    try {
        console.log('Payment request details:', req.body);
        const { total, phone, momoTokenId } = req.body;

        if (!momoTokenId) {
            return res.status(400).json({ error: 'MoMo token not available' });
        }

        const externalId = uuidv4();
        const body = {
            amount: total,  // Total amount for the transaction
            currency: 'EUR',  // Currency for the transaction
            externalId: externalId,  // Unique ID for each transaction
            payer: {
                partyIdType: 'MSISDN',
                partyId: phone,  // Phone number of the payer
            },
            payerMessage: 'Payment for order',
            payeeNote: 'Payment for order',
        };

        console.log('External Id: ', body.externalId);

        const paymentRefId = uuidv4();  // New UUID for the request
        console.log('PaymentRefId: ', paymentRefId);
        const momoResponse = await axios.post(
            momoRequestToPayUrl,
            body,
            {
                headers: {
                    'X-Reference-Id': paymentRefId,
                    'X-Target-Environment': 'sandbox',
                    'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY,
                    Authorization: `Bearer ${momoTokenId}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        res.json({ momoResponse: momoResponse.data, success: true, paymentRefId: paymentRefId, externalId: externalId });  // Returns response from MoMo API
    } catch (error) {
        console.error('Error in processing payment request:', error);
        res.status(500).json({ error: `An error occurred: ${error.message}` });
    }
});

// Endpoint: Get Request to Pay Transaction Status
// This endpoint retrieves the status of a payment transaction using its reference ID.
// It is useful for confirming the status of a transaction initiated by the `/request-to-pay` endpoint.
app.get('/payment-status/:transactionId', async (req, res) => {
    const transactionId = req.params.transactionId;
    const apiUrl = `https://${momoHost}/collection/v1_0/requesttopay/${transactionId}`;
    const headers = {
        'Ocp-Apim-Subscription-Key': MOMO_SUBSCRIPTION_KEY,
        'X-Target-Environment': 'sandbox'
    };

    try {
        const response = await axios.get(apiUrl, { headers: headers });
        res.status(200).json(response.data);  // Returns the status of the payment transaction
    } catch (error) {
        console.error('Error in retrieving payment status:', error);
        res.status(500).json({ error: `An error occurred: ${error.message}` });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});