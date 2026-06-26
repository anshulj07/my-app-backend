import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import clientPromise from './mongodb';

const expo = new Expo();

export async function sendPushNotification(clerkUserId: string, title: string, body: string, data?: Record<string, any>) {
  try {
    const client = await clientPromise;
    const db = client.db("assis_auth");
    
    // Find the user's expoPushToken
    const userDoc = await db.collection("users").findOne({ clerkUserId });
    const pushToken = userDoc?.profile?.expoPushToken;

    if (!pushToken || !Expo.isExpoPushToken(pushToken)) {
      console.log(`[Push] User ${clerkUserId} does not have a valid Expo push token`);
      return false;
    }

    const message: ExpoPushMessage = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data: data || {},
    };

    const chunks = expo.chunkPushNotifications([message]);
    const tickets = [];
    
    // Send the chunks to the Expo push notification service
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('[Push] Error sending push notification chunk:', error);
      }
    }
    
    return true;
  } catch (error) {
    console.error('[Push] Error in sendPushNotification:', error);
    return false;
  }
}
