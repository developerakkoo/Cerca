# Chat System Integration Plan - User and Driver Apps

## Overview

This plan outlines the integration of a real-time chat system between users and drivers with new message indicators (circular badges) displayed throughout the UI. The system will track unread messages, display badges on chat buttons/icons, and update counts in real-time via Socket.IO.

## Current State Analysis

### Backend (Already Implemented ✅)
- **Socket Events**: `sendMessage`, `receiveMessage`, `messageSent`, `getRideMessages`, `markMessageRead`
- **REST Endpoints**:
  - `POST /messages` - Send message
  - `GET /messages/ride/:rideId` - Get ride messages
  - `GET /messages/unread/:receiverId?receiverModel=User|Driver` - Get unread messages
  - `PATCH /messages/:id/read` - Mark message as read
  - `PATCH /messages/ride/:rideId/read-all` - Mark all messages as read for a ride
- **Message Model**: Includes `isRead` boolean field, `receiver`, `receiverModel`, `ride` references

### User App (Angular/Ionic) - Partial Implementation
- ✅ `driver-chat.page.ts/html` - Chat page exists
- ✅ `active-ordere.page.ts/html` - Active ride page with chat button
- ✅ `ride.service.ts` - Has `sendMessage()` and `getRideMessages()` methods
- ❌ Missing: Unread count tracking and badge display
- ❌ Missing: Real-time unread count updates
- ❌ Missing: Mark messages as read when opening chat

### Driver App (Flutter) - Partial Implementation
- ✅ `chat_screen.dart` - Chat screen exists
- ✅ `active_ride_screen.dart` - Has `_unreadMessageCount` placeholder but not implemented
- ✅ `rides_screen.dart` - Shows list of rides
- ✅ `message_service.dart` - Has `getUnreadMessageCount()` method
- ❌ Missing: Actual unread count fetching and display
- ❌ Missing: Badge indicators on chat buttons
- ❌ Missing: Real-time unread count updates
- ❌ Missing: Mark messages as read when opening chat

## Implementation Plan

### Phase 1: Backend Enhancements

#### Step 1.1: Add Unread Count Endpoint per Ride
**File**: `Cerca-API/Controllers/Driver/message.controller.js`

- **New Function**: `getUnreadCountForRide`
  - **Route**: `GET /messages/ride/:rideId/unread-count`
  - **Query Params**: `receiverId`, `receiverModel` (User or Driver)
  - **Returns**: `{ unreadCount: number, rideId: string }`
  - **Purpose**: Get unread message count for a specific ride and receiver

**Implementation**:
```javascript
const getUnreadCountForRide = async (req, res) => {
    try {
        const { rideId } = req.params;
        const { receiverId, receiverModel } = req.query;

        if (!receiverId || !receiverModel || !['User', 'Driver'].includes(receiverModel)) {
            return res.status(400).json({ message: 'Invalid or missing receiverId/receiverModel' });
        }

        const unreadCount = await Message.countDocuments({
            ride: rideId,
            receiver: receiverId,
            receiverModel,
            isRead: false
        });

        res.status(200).json({ 
            unreadCount,
            rideId 
        });
    } catch (error) {
        logger.error('Error fetching unread count:', error);
        res.status(500).json({ message: 'Error fetching unread count', error: error.message });
    }
};
```

#### Step 1.2: Add Route for Unread Count
**File**: `Cerca-API/Routes/Driver/message.routes.js`

- Add route: `router.get('/ride/:rideId/unread-count', getUnreadCountForRide);`
- Export `getUnreadCountForRide` from controller

#### Step 1.3: Enhance Socket Events for Unread Count Updates
**File**: `Cerca-API/utils/socket.js`

- When `sendMessage` is received and message is saved:
  - Emit `unreadCountUpdated` event to receiver with:
    ```javascript
    {
        rideId: rideId,
        receiverId: receiverId,
        receiverModel: receiverModel,
        unreadCount: unreadCount // Total unread for this ride
    }
    ```
- When `markMessageRead` or `markAllMessagesAsRead` is called:
  - Emit `unreadCountUpdated` event to receiver with updated count

### Phase 2: User App (Angular/Ionic) Implementation

#### Step 2.1: Create Chat Service
**File**: `Cerca/src/app/services/chat.service.ts` (NEW)

- **Purpose**: Centralized chat state management
- **Methods**:
  - `getUnreadCount(rideId: string, userId: string): Observable<number>`
  - `markMessagesAsRead(rideId: string, userId: string): Promise<void>`
  - `getUnreadCountForRide(rideId: string, userId: string): Promise<number>`
- **Properties**:
  - `unreadCounts$: BehaviorSubject<Map<string, number>>` - Map of rideId -> unread count
- **Socket Listeners**:
  - Listen to `receiveMessage` and increment unread count
  - Listen to `unreadCountUpdated` and update local state
  - Listen to `messageSent` and update count if needed

#### Step 2.2: Update Ride Service
**File**: `Cerca/src/app/services/ride.service.ts`

- Add `unreadCounts$: BehaviorSubject<Map<string, number>>` property
- Add method `getUnreadCountForRide(rideId: string): Promise<number>`
- Add method `markMessagesAsRead(rideId: string): Promise<void>`
- Listen to `unreadCountUpdated` socket event and update `unreadCounts$`
- Listen to `receiveMessage` and increment count for the ride

#### Step 2.3: Update Active Order Page
**File**: `Cerca/src/app/pages/active-ordere/active-ordere.page.ts`

- Add property: `unreadMessageCount: number = 0`
- Inject `RideService` (already injected)
- In `ngOnInit()`:
  - Subscribe to `rideService.unreadCounts$` and update `unreadMessageCount` for current ride
  - Call `rideService.getUnreadCountForRide(rideId)` to fetch initial count
- Add method `markMessagesAsRead()`:
  - Call `rideService.markMessagesAsRead(rideId)` when chat is opened
- Update `chatWithDriver()`:
  - Call `markMessagesAsRead()` before navigating to chat page

**File**: `Cerca/src/app/pages/active-ordere/active-ordere.page.html`

- Update chat button (line 67-70):
  ```html
  <ion-button expand="block" fill="clear" (click)="chatWithDriver()">
    <ion-icon name="chatbubble-outline" slot="start"></ion-icon>
    Chat
    <ion-badge *ngIf="unreadMessageCount > 0" color="danger" slot="end">
      {{ unreadMessageCount }}
    </ion-badge>
  </ion-button>
  ```

#### Step 2.4: Update Driver Chat Page
**File**: `Cerca/src/app/pages/driver-chat/driver-chat.page.ts`

- In `ngOnInit()`:
  - Call `rideService.markMessagesAsRead(currentRide._id)` when page loads
  - This marks all messages as read when user opens chat
- Listen to `receiveMessage` and update UI immediately (already implemented)

#### Step 2.5: Add HTTP Client Methods
**File**: `Cerca/src/app/services/ride.service.ts`

- Add methods to call backend endpoints:
  ```typescript
  async getUnreadCountForRide(rideId: string): Promise<number> {
    const userId = await this.storage.get('userId');
    const response = await this.http.get<{unreadCount: number}>(
      `${environment.apiUrl}/messages/ride/${rideId}/unread-count?receiverId=${userId}&receiverModel=User`
    ).toPromise();
    return response?.unreadCount || 0;
  }

  async markMessagesAsRead(rideId: string): Promise<void> {
    const userId = await this.storage.get('userId');
    await this.http.patch(
      `${environment.apiUrl}/messages/ride/${rideId}/read-all`,
      { receiverId: userId }
    ).toPromise();
    // Update local state
    const currentCounts = this.unreadCounts$.value;
    currentCounts.set(rideId, 0);
    this.unreadCounts$.next(new Map(currentCounts));
  }
  ```

### Phase 3: Driver App (Flutter) Implementation

#### Step 3.1: Update Message Service
**File**: `driver_cerca/lib/services/message_service.dart`

- **Enhance `getUnreadMessageCount()`**:
  - Currently fetches all messages and filters locally
  - **Better**: Call backend endpoint `GET /messages/ride/:rideId/unread-count`
  - Add method: `static Future<int> getUnreadCountForRide(String rideId, String driverId)`
- **Add method**: `static Future<void> markAllMessagesAsRead(String rideId, String driverId)`

#### Step 3.2: Update Socket Service
**File**: `driver_cerca/lib/services/socket_service.dart`

- Add callback: `static Function(Map<String, dynamic>)? onUnreadCountUpdated;`
- In socket event handlers:
  - Listen to `unreadCountUpdated` event
  - Call `onUnreadCountUpdated` callback with data: `{rideId: String, unreadCount: int}`

#### Step 3.3: Update Active Ride Screen
**File**: `driver_cerca/lib/screens/active_ride_screen.dart`

- **Update `_loadUnreadMessageCount()`**:
  - Call `MessageService.getUnreadCountForRide(_ride.id, _driverId!)`
  - Update `_unreadMessageCount` state
- **Add method `_setupUnreadCountListener()`**:
  - Set `SocketService.onUnreadCountUpdated` callback
  - Update `_unreadMessageCount` when event is received
- **Update `_openChat()`**:
  - Call `MessageService.markAllMessagesAsRead(_ride.id, _driverId!)` before navigating
  - Reset `_unreadMessageCount` to 0
- **Update `initState()`**:
  - Call `_setupUnreadCountListener()`
- **Update `dispose()`**:
  - Clear `SocketService.onUnreadCountUpdated` callback

**File**: `driver_cerca/lib/screens/active_ride_screen.dart` (UI)

- Badge is already implemented in `_buildPassengerCard()` (lines 753-778)
- Ensure `_unreadMessageCount` is properly updated and displayed

#### Step 3.4: Update Rides Screen
**File**: `driver_cerca/lib/screens/rides_screen.dart`

- Add property: `Map<String, int> _unreadCounts = {};` - Map of rideId -> unread count
- Add method `_loadUnreadCounts()`:
  - For each active ride, call `MessageService.getUnreadCountForRide(ride.id, _driverId!)`
  - Store in `_unreadCounts` map
- Add method `_setupUnreadCountListener()`:
  - Set `SocketService.onUnreadCountUpdated` callback
  - Update `_unreadCounts` map when event is received
- **Update ride list items**:
  - Add badge indicator next to ride item if `_unreadCounts[ride.id] > 0`
  - Show circular badge with count
- **Update `initState()`**:
  - Call `_setupUnreadCountListener()`
  - Call `_loadUnreadCounts()` after loading rides
- **Update `dispose()`**:
  - Clear `SocketService.onUnreadCountUpdated` callback

#### Step 3.5: Update Chat Screen
**File**: `driver_cerca/lib/screens/chat_screen.dart`

- **Update `initState()`**:
  - Call `MessageService.markAllMessagesAsRead(widget.ride.id, _driverId!)` when screen loads
  - This marks all messages as read when driver opens chat
- **Update `_setupMessageListener()`**:
  - When new message is received, it's already added to UI
  - No need to update unread count here (handled by socket event)

### Phase 4: Real-Time Updates

#### Step 4.1: Backend Socket Event Emission
**File**: `Cerca-API/utils/socket.js`

- **In `sendMessage` handler**:
  - After saving message, calculate unread count for receiver
  - Emit `unreadCountUpdated` to receiver's socket:
    ```javascript
    const unreadCount = await Message.countDocuments({
        ride: rideId,
        receiver: receiverId,
        receiverModel: receiverModel,
        isRead: false
    });
    
    io.to(receiverSocketId).emit('unreadCountUpdated', {
        rideId: rideId,
        receiverId: receiverId,
        receiverModel: receiverModel,
        unreadCount: unreadCount
    });
    ```

- **In `markMessageRead` handler**:
  - After marking as read, recalculate unread count
  - Emit `unreadCountUpdated` to receiver

- **In `markAllMessagesAsRead` handler**:
  - After marking all as read, emit `unreadCountUpdated` with count 0

#### Step 4.2: User App Socket Listener
**File**: `Cerca/src/app/services/ride.service.ts`

- Add socket listener in `setupSocketListeners()`:
  ```typescript
  const unreadCountUpdatedSub = this.socketService
    .on<{rideId: string, unreadCount: number}>('unreadCountUpdated')
    .subscribe((data) => {
      const currentCounts = this.unreadCounts$.value;
      currentCounts.set(data.rideId, data.unreadCount);
      this.unreadCounts$.next(new Map(currentCounts));
    });
  this.socketSubscriptions.push(unreadCountUpdatedSub);
  ```

#### Step 4.3: Driver App Socket Listener
**File**: `driver_cerca/lib/services/socket_service.dart`

- Add socket listener in connection handler:
  ```dart
  socket.on('unreadCountUpdated', (data) {
    if (onUnreadCountUpdated != null) {
      onUnreadCountUpdated!(data);
    }
  });
  ```

### Phase 5: UI/UX Enhancements

#### Step 5.1: Badge Styling (User App)
**File**: `Cerca/src/app/pages/active-ordere/active-ordere.page.scss`

- Add styles for chat badge:
  ```scss
  ion-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 20px;
    height: 20px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px 6px;
  }
  ```

#### Step 5.2: Badge Styling (Driver App)
**File**: `driver_cerca/lib/screens/active_ride_screen.dart`

- Badge is already styled in `_buildPassengerCard()` (lines 763-777)
- Ensure it's visible and properly positioned

#### Step 5.3: Badge on Rides List (Driver App)
**File**: `driver_cerca/lib/screens/rides_screen.dart`

- Add badge widget in ride list item:
  ```dart
  if (_unreadCounts[ride.id] != null && _unreadCounts[ride.id]! > 0)
    Positioned(
      right: 8,
      top: 8,
      child: Container(
        padding: EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: Colors.red,
          shape: BoxShape.circle,
        ),
        child: Text(
          '${_unreadCounts[ride.id]}',
          style: TextStyle(
            color: Colors.white,
            fontSize: 10,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    ),
  ```

### Phase 6: Testing and Edge Cases

#### Step 6.1: Test Scenarios
1. **User sends message to driver**:
   - Driver's badge should update in real-time
   - Driver's active ride screen should show badge
   - Driver's rides list should show badge

2. **Driver sends message to user**:
   - User's badge should update in real-time
   - User's active order page should show badge

3. **User opens chat**:
   - All messages should be marked as read
   - Badge should disappear
   - Backend should emit `unreadCountUpdated` with count 0

4. **Driver opens chat**:
   - All messages should be marked as read
   - Badge should disappear
   - Backend should emit `unreadCountUpdated` with count 0

5. **Multiple rides with unread messages**:
   - Each ride should show its own badge count
   - Opening one chat shouldn't affect other rides' badges

6. **Socket reconnection**:
   - Unread counts should be refetched from backend
   - Badges should update correctly

#### Step 6.2: Error Handling
- If unread count API fails, show badge with "?" or hide it
- If mark as read fails, log error but don't block UI
- If socket disconnects, fall back to polling unread counts every 30 seconds

## Files to Create

1. `Cerca/src/app/services/chat.service.ts` (Optional - can use RideService instead)

## Files to Modify

### Backend
1. `Cerca-API/Controllers/Driver/message.controller.js` - Add `getUnreadCountForRide`
2. `Cerca-API/Routes/Driver/message.routes.js` - Add route for unread count
3. `Cerca-API/utils/socket.js` - Emit `unreadCountUpdated` events

### User App (Angular/Ionic)
1. `Cerca/src/app/services/ride.service.ts` - Add unread count tracking and methods
2. `Cerca/src/app/pages/active-ordere/active-ordere.page.ts` - Add unread count display
3. `Cerca/src/app/pages/active-ordere/active-ordere.page.html` - Add badge to chat button
4. `Cerca/src/app/pages/active-ordere/active-ordere.page.scss` - Style badge
5. `Cerca/src/app/pages/driver-chat/driver-chat.page.ts` - Mark messages as read on open

### Driver App (Flutter)
1. `driver_cerca/lib/services/message_service.dart` - Add unread count endpoint call
2. `driver_cerca/lib/services/socket_service.dart` - Add `onUnreadCountUpdated` callback
3. `driver_cerca/lib/screens/active_ride_screen.dart` - Implement unread count display
4. `driver_cerca/lib/screens/rides_screen.dart` - Add badges to ride list items
5. `driver_cerca/lib/screens/chat_screen.dart` - Mark messages as read on open

## Implementation Order

1. **Backend** (Phase 1) - Foundation for unread counts
2. **User App** (Phase 2) - Basic unread count display
3. **Driver App** (Phase 3) - Basic unread count display
4. **Real-Time Updates** (Phase 4) - Socket events for live updates
5. **UI/UX** (Phase 5) - Badge styling and positioning
6. **Testing** (Phase 6) - Comprehensive testing and edge cases

## Success Criteria

✅ Unread message badges appear on chat buttons/icons in both apps
✅ Badges update in real-time when new messages arrive
✅ Badges disappear when chat is opened (messages marked as read)
✅ Badges show correct count for each ride
✅ Badges persist across app restarts (fetched from backend)
✅ Socket reconnection handles unread count updates correctly
✅ Multiple rides show independent badge counts

## Notes

- Badge should be circular with red background
- Badge should show number if count > 0, hide if count is 0
- Badge should be positioned top-right of chat icon/button
- Badge count should update immediately when message is received
- Badge should be cleared when user/driver opens chat screen
- Backend should emit `unreadCountUpdated` event for real-time updates
- Frontend should fall back to API polling if socket is disconnected

