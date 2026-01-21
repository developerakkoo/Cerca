import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  ChangeDetectorRef,
} from '@angular/core';
import { ModalController, NavParams } from '@ionic/angular';
import { RideService, Ride } from 'src/app/services/ride.service';
import { SocketService } from 'src/app/services/socket.service';
import { Subscription } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Storage } from '@ionic/storage-angular';

interface ChatMessage {
  _id?: string;
  text: string;
  time: string;
  image?: string;
  sender: 'user' | 'driver';
  isRead?: boolean;
  createdAt?: string;
}

@Component({
  selector: 'app-driver-chat',
  templateUrl: './driver-chat.page.html',
  styleUrls: ['./driver-chat.page.scss'],
  standalone: false,
})
export class DriverChatPage implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageContainer') private messageContainer!: ElementRef;

  messages: ChatMessage[] = [];
  newMessage: string = '';
  currentRide: Ride | null = null;
  driverName: string = 'Driver';
  isLoadingMessages: boolean = false;

  private messageSubscription?: Subscription;
  private messagesSubscription?: Subscription;
  private messageSentSubscription?: Subscription;
  private messageIds: Set<string> = new Set(); // Track message IDs to prevent duplicates
  private userId: string | null = null; // Store current user ID to filter self-sent messages

  constructor(
    private modalController: ModalController,
    private navParams: NavParams,
    private rideService: RideService,
    private socketService: SocketService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private storage: Storage
  ) {}

  async ngOnInit() {
    console.log('🚀 ========================================');
    console.log('🚀 [DriverChatPage] ngOnInit() called');
    console.log('🚀 ========================================');
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    // Get user ID from storage to filter self-sent messages
    this.userId = await this.storage.get('userId');
    console.log('👤 [DriverChatPage] User ID loaded:', this.userId || 'null');
    
    // Get ride data from modal params or service
    const rideFromParams = this.navParams.get('ride');
    console.log('📦 [DriverChatPage] Ride from params:', rideFromParams ? { id: rideFromParams._id } : 'null');
    
    if (rideFromParams) {
      this.currentRide = rideFromParams;
      console.log('✅ [DriverChatPage] Using ride from params');
    } else {
      // Fallback to service if not passed via params
      this.currentRide = this.rideService.getCurrentRideValue();
      console.log('✅ [DriverChatPage] Using ride from service:', this.currentRide ? { id: this.currentRide._id } : 'null');
    }

    if (this.currentRide && this.currentRide.driver) {
      this.driverName = this.currentRide.driver.name;
      console.log('👤 [DriverChatPage] Driver name:', this.driverName);
      console.log('🆔 [DriverChatPage] Ride ID:', this.currentRide._id);
      console.log('🆔 [DriverChatPage] Driver ID:', this.currentRide.driver._id);

      // Check socket connection status and join room
      const isSocketConnected = this.socketService.isConnected();
      const socketId = this.socketService.getSocketId();
      console.log('🔌 [DriverChatPage] Socket connection status:', isSocketConnected ? 'CONNECTED' : 'DISCONNECTED');
      console.log('🔌 [DriverChatPage] Socket ID:', socketId || 'null');
      
      // Ensure socket connection before joining room
      if (!isSocketConnected) {
        console.warn('⚠️ [DriverChatPage] Socket not connected, waiting for connection...');
        try {
          await this.socketService.waitForConnection(10000); // Wait up to 10 seconds
          const stillConnected = this.socketService.isConnected();
          if (stillConnected) {
            console.log('✅ [DriverChatPage] Socket connected, proceeding with room join');
          } else {
            console.error('❌ [DriverChatPage] Socket failed to connect within timeout');
          }
        } catch (error) {
          console.error('❌ [DriverChatPage] Error waiting for socket connection:', error);
        }
      }
      
      // Join ride room for real-time messaging
      if (this.socketService.isConnected() && this.currentRide._id) {
        console.log('🚪 [DriverChatPage] Joining ride room...');
        try {
          await this.rideService.joinRideRoom(this.currentRide._id, undefined, 'User');
          console.log('✅ [DriverChatPage] Joined ride room successfully');
        } catch (error) {
          console.error('❌ [DriverChatPage] Error joining room:', error);
          console.error('   Error type:', error?.constructor?.name);
          console.error('   Error message:', error instanceof Error ? error.message : String(error));
        }
      } else {
        console.warn('⚠️ [DriverChatPage] Cannot join room: socket not connected or ride ID missing');
      }

      // Mark all messages as read when opening chat
      console.log('📖 [DriverChatPage] Marking all messages as read...');
      try {
        await this.rideService.markMessagesAsRead(this.currentRide._id);
        console.log('✅ [DriverChatPage] All messages marked as read');
      } catch (error) {
        console.error('❌ [DriverChatPage] Error marking messages as read:', error);
      }

      // Load existing messages via REST API (primary method)
      console.log('📚 [DriverChatPage] Loading messages via REST API...');
      await this.loadMessages();
      
      // Also request via socket as backup
      console.log('📡 [DriverChatPage] Requesting messages via socket...');
      this.rideService.getRideMessages(this.currentRide._id);
    } else {
      console.error('❌ [DriverChatPage] No ride or driver available');
      console.error('   Ride exists:', !!this.currentRide);
      console.error('   Driver exists:', !!this.currentRide?.driver);
    }

    // Listen for incoming messages
    console.log('👂 [DriverChatPage] Setting up receiveMessage listener...');
    const isSocketConnected = this.socketService.isConnected();
    console.log('🔌 [DriverChatPage] Socket connected for listener setup:', isSocketConnected);
    
    this.messageSubscription = this.socketService
      .on<any>('receiveMessage')
      .subscribe((message) => {
        console.log('📨 [DriverChatPage] receiveMessage event received');
        console.log('   Socket connected:', this.socketService.isConnected());
        console.log('   Message ride ID:', message.rideId || message.ride);
        console.log('   Current ride ID:', this.currentRide?._id);
        
        // Process message immediately
        this.handleReceivedMessage(message);
        
        // Force UI update
        this.cdr.detectChanges();
      });
    console.log('✅ [DriverChatPage] receiveMessage listener set up');

    // Listen for chat history from socket
    console.log('👂 [DriverChatPage] Setting up rideMessages listener...');
    this.messagesSubscription = this.socketService
      .on<any>('rideMessages')
      .subscribe((messages) => {
        console.log('📚 [DriverChatPage] rideMessages event received');
        console.log('   Messages count:', Array.isArray(messages) ? messages.length : 'not an array');
        
        // Filter messages by current ride ID
        if (this.currentRide?._id && Array.isArray(messages)) {
          const filteredMessages = messages.filter((msg: any) => {
            const msgRideId = msg.rideId || msg.ride?.toString() || msg.ride;
            return msgRideId === this.currentRide?._id;
          });
          console.log('   Filtered messages count:', filteredMessages.length);
          this.processMessages(filteredMessages);
        } else {
          this.processMessages(messages);
        }
      });
    console.log('✅ [DriverChatPage] rideMessages listener set up');

    // Listen for message sent confirmation
    console.log('👂 [DriverChatPage] Setting up messageSent listener...');
    this.messageSentSubscription = this.socketService
      .on<any>('messageSent')
      .subscribe((data) => {
        console.log('✅ [DriverChatPage] messageSent event received');
        console.log('   Data:', data);
        // Update optimistic message with actual message data if available
        if (data.message && data.message._id) {
          console.log('🔄 [DriverChatPage] Updating optimistic message with confirmation');
          this.updateMessageWithId(data.message);
        } else {
          console.warn('⚠️ [DriverChatPage] messageSent event missing message data');
        }
      });
    console.log('✅ [DriverChatPage] messageSent listener set up');
    
    console.log('✅ [DriverChatPage] ngOnInit() completed');
    console.log('========================================');
  }

  private async loadMessages() {
    console.log('📚 ========================================');
    console.log('📚 [DriverChatPage] loadMessages() called');
    console.log('📚 ========================================');
    
    if (!this.currentRide) {
      console.warn('⚠️ [DriverChatPage] No current ride, cannot load messages');
      return;
    }
    
    console.log('🆔 [DriverChatPage] Ride ID:', this.currentRide._id);
    console.log('⏰ [DriverChatPage] Starting message load at:', new Date().toISOString());
    
    this.isLoadingMessages = true;
    console.log('🔄 [DriverChatPage] Loading state set to true');
    
    try {
      console.log('🌐 [DriverChatPage] Calling getRideMessagesViaAPI...');
      const messages = await this.rideService.getRideMessagesViaAPI(this.currentRide._id);
      console.log('✅ [DriverChatPage] API call completed');
      console.log('📦 [DriverChatPage] Messages received:', messages);
      console.log('📊 [DriverChatPage] Message count:', messages?.length || 0);
      console.log('📊 [DriverChatPage] Is array:', Array.isArray(messages));
      
      if (messages && messages.length > 0) {
        console.log('✅ [DriverChatPage] Processing', messages.length, 'messages...');
        this.processMessages(messages);
        console.log('✅ [DriverChatPage] Messages processed and displayed');
        console.log('📊 [DriverChatPage] Final message count in UI:', this.messages.length);
      } else {
        console.warn('⚠️ [DriverChatPage] No messages to display');
        this.messages = [];
      }
    } catch (error) {
      console.error('❌ [DriverChatPage] Error loading messages:', error);
      console.error('   Error type:', error?.constructor?.name);
      console.error('   Error message:', error instanceof Error ? error.message : String(error));
      console.error('   Error stack:', error instanceof Error ? error.stack : 'N/A');
    } finally {
      this.isLoadingMessages = false;
      console.log('🔄 [DriverChatPage] Loading state set to false');
      console.log('✅ [DriverChatPage] loadMessages() completed');
      console.log('========================================');
    }
  }

  private processMessages(messages: any) {
    console.log('🔄 ========================================');
    console.log('🔄 [DriverChatPage] processMessages() called');
    console.log('🔄 ========================================');
    console.log('📦 Raw messages data:', messages);
    console.log('📦 Messages type:', typeof messages);
    console.log('📦 Is array:', Array.isArray(messages));
    
    if (!messages || !Array.isArray(messages)) {
      console.warn('⚠️ [DriverChatPage] Invalid messages format:', messages);
      console.warn('⚠️ [DriverChatPage] Type:', typeof messages, 'Is Array:', Array.isArray(messages));
      return;
    }

    console.log('📋 [DriverChatPage] Processing', messages.length, 'messages');
    console.log('📊 [DriverChatPage] Current tracked IDs:', this.messageIds.size);
    console.log('📊 [DriverChatPage] Current messages count:', this.messages.length);

    // Build a set of existing message IDs and content hashes for duplicate detection
    const existingIds = new Set(this.messages.map(m => m._id).filter(id => !!id));
    const existingContentHashes = new Set(
      this.messages
        .filter(m => !m._id) // Only check optimistic messages
        .map(m => `${m.text}_${m.createdAt}`)
    );

    // Process and sort messages, merging with existing messages
    let processedCount = 0;
    let skippedCount = 0;
    let duplicateCount = 0;
    
    const processedMessages: ChatMessage[] = messages
      .map((msg, index) => {
        // Handle different message formats
        const messageId = msg._id || msg.id;
        const messageText = msg.message || msg.text;
        const senderModel = msg.senderModel || (msg.sender?.role || 'User');
        const createdAt = msg.createdAt || msg.created_at || new Date().toISOString();

        if (!messageId || !messageText) {
          console.warn(`⚠️ [DriverChatPage] Invalid message format at index ${index}:`, {
            hasId: !!messageId,
            hasText: !!messageText,
            message: msg
          });
          skippedCount++;
          return null;
        }

        // Check for duplicates: by ID or by content hash (for optimistic messages)
        const contentHash = `${messageText}_${createdAt}`;
        if (existingIds.has(messageId) || existingContentHashes.has(contentHash)) {
          console.log(`⚠️ [DriverChatPage] Duplicate message detected at index ${index}:`, {
            id: messageId,
            text: messageText.substring(0, 30)
          });
          duplicateCount++;
          return null; // Skip duplicate
        }

        // Track message ID to prevent duplicates
        this.messageIds.add(messageId);
        existingIds.add(messageId);
        processedCount++;

        const processed: ChatMessage = {
          _id: messageId,
          text: messageText,
          time: this.formatTime(createdAt),
          sender: (senderModel === 'User' ? 'user' : 'driver') as 'user' | 'driver',
          isRead: msg.isRead !== false,
          createdAt: createdAt,
        };

        return processed;
      })
      .filter((msg): msg is ChatMessage => msg !== null && msg !== undefined);

    // Merge with existing messages (preserve optimistic messages without IDs)
    const mergedMessages = [...this.messages.filter(m => !m._id), ...processedMessages];
    
    // Sort by createdAt timestamp
    mergedMessages.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.time || 0).getTime();
      const timeB = new Date(b.createdAt || b.time || 0).getTime();
      return timeA - timeB;
    });

    console.log('📊 [DriverChatPage] Processing summary:');
    console.log('   Total messages:', messages.length);
    console.log('   Processed:', processedCount);
    console.log('   Skipped:', skippedCount);
    console.log('   Duplicates:', duplicateCount);
    console.log('   Valid new messages:', processedMessages.length);
    console.log('   Tracked IDs:', this.messageIds.size);

    console.log('✅ [DriverChatPage] Processed', processedMessages.length, 'new messages');
    const beforeCount = this.messages.length;
    this.messages = mergedMessages;
    console.log('📝 [DriverChatPage] Messages array updated (before:', beforeCount, 'after:', this.messages.length + ')');
    
    // Force UI update
    this.cdr.detectChanges();
    
    // Force scroll to bottom when loading messages initially
    setTimeout(() => {
      console.log('📜 [DriverChatPage] Triggering scroll to bottom after processing');
      this.scrollToBottom(true);
    }, 300);
    
    console.log('✅ [DriverChatPage] processMessages() completed');
    console.log('========================================');
  }

  private handleReceivedMessage(message: any) {
    console.log('📨 ========================================');
    console.log('📨 [DriverChatPage] handleReceivedMessage() called');
    console.log('📨 ========================================');
    console.log('📦 Raw message data:', message);
    console.log('📦 Message type:', typeof message);
    console.log('📦 Is array:', Array.isArray(message));
    
    if (!message) {
      console.warn('⚠️ [DriverChatPage] Received null/undefined message');
      return;
    }

    // Filter by rideId - only process messages for current ride
    const messageRideId = message.rideId || message.ride?.toString() || message.ride;
    const currentRideId = this.currentRide?._id;
    
    console.log('🆔 [DriverChatPage] Message ride ID:', messageRideId);
    console.log('🆔 [DriverChatPage] Current ride ID:', currentRideId);
    
    if (currentRideId && messageRideId && messageRideId !== currentRideId) {
      console.log('⚠️ [DriverChatPage] Message filtered out - ride ID mismatch');
      console.log('   Message ride ID:', messageRideId);
      console.log('   Current ride ID:', currentRideId);
      return;
    }

    // Filter self-sent messages - ignore messages sent by current user
    // The sender already has the message from optimistic update
    const messageSenderId = message.sender?._id || message.sender?.toString() || message.sender;
    if (this.userId && messageSenderId && messageSenderId === this.userId) {
      console.log('⚠️ [DriverChatPage] Ignoring self-sent message');
      console.log('   Message sender ID:', messageSenderId);
      console.log('   Current user ID:', this.userId);
      console.log('   Message will be updated via messageSent confirmation instead');
      return;
    }

    const messageId = message._id || message.id;
    console.log('🆔 [DriverChatPage] Extracted message ID:', messageId);
    
    if (!messageId) {
      console.warn('⚠️ [DriverChatPage] Received message without ID:', message);
      console.log('   Message keys:', Object.keys(message));
      return;
    }

    // Prevent duplicate messages
    if (this.messageIds.has(messageId)) {
      console.log('⚠️ [DriverChatPage] Duplicate message ignored:', messageId);
      console.log('   Current tracked IDs:', Array.from(this.messageIds).slice(-5));
      return;
    }

    // Determine sender based on senderModel
    const senderModel = message.senderModel || (message.sender?.role || 'Driver');
    const sender: 'user' | 'driver' = senderModel === 'User' ? 'user' : 'driver';
    console.log('👤 [DriverChatPage] Sender model:', senderModel);
    console.log('👤 [DriverChatPage] Determined sender:', sender);

    const chatMessage: ChatMessage = {
      _id: messageId,
      text: message.message || message.text,
      time: this.formatTime(message.createdAt || message.created_at),
      sender: sender,
      isRead: message.isRead !== false,
      createdAt: message.createdAt || message.created_at,
    };

    console.log('💬 [DriverChatPage] Processed chat message:', {
      id: chatMessage._id,
      text: chatMessage.text.substring(0, 50) + (chatMessage.text.length > 50 ? '...' : ''),
      sender: chatMessage.sender,
      time: chatMessage.time,
    });

    this.addMessage(chatMessage);
    
    // Force UI update
    this.cdr.detectChanges();

    // Track message ID (already tracked in addMessage, but ensure it's there)
    if (messageId) {
      this.messageIds.add(messageId);
      console.log('✅ [DriverChatPage] Message ID tracked:', messageId);
    }
    
    // Force scroll when receiving new message
    setTimeout(() => {
      console.log('📜 [DriverChatPage] Triggering scroll to bottom for received message');
      this.scrollToBottom(true);
    }, 200);
    
    console.log('✅ [DriverChatPage] handleReceivedMessage() completed');
    console.log('========================================');
  }

  private updateMessageWithId(messageData: any) {
    console.log('🔄 [DriverChatPage] updateMessageWithId() called');
    console.log('   Message data:', messageData);
    console.log('   Message ID:', messageData._id);
    console.log('   Current messages count:', this.messages.length);
    
    const messageText = messageData.message || messageData.text;
    const messageCreatedAt = messageData.createdAt || new Date().toISOString();
    
    // Find optimistic message by matching content and timestamp (within 5 seconds)
    // This is more reliable than just checking the last message
    const optimisticMessageIndex = this.messages.findIndex((msg) => {
      if (msg._id) {
        // Already has ID, skip
        return false;
      }
      
      // Match by text content and approximate timestamp
      const textMatch = msg.text === messageText;
      if (!textMatch) {
        return false;
      }
      
      // Check if timestamp is within 5 seconds (to account for network delay)
      const msgTime = new Date(msg.createdAt || 0).getTime();
      const serverTime = new Date(messageCreatedAt).getTime();
      const timeDiff = Math.abs(msgTime - serverTime);
      const isWithinTimeWindow = timeDiff < 5000; // 5 seconds
      
      return isWithinTimeWindow;
    });
    
    if (optimisticMessageIndex !== -1) {
      console.log('✅ [DriverChatPage] Found optimistic message at index:', optimisticMessageIndex);
      const optimisticMessage = this.messages[optimisticMessageIndex];
      optimisticMessage._id = messageData._id;
      optimisticMessage.createdAt = messageCreatedAt;
      optimisticMessage.time = this.formatTime(messageCreatedAt);
      this.messageIds.add(messageData._id);
      console.log('✅ [DriverChatPage] Optimistic message updated with ID:', messageData._id);
    } else {
      // Check if message already exists with this ID
      const existingIndex = this.messages.findIndex((msg) => msg._id === messageData._id);
      if (existingIndex === -1) {
        console.warn('⚠️ [DriverChatPage] Optimistic message not found for update');
        console.warn('   Message text:', messageText?.substring(0, 50));
        console.warn('   This might be a duplicate or the message was already processed');
      } else {
        console.log('ℹ️ [DriverChatPage] Message already exists with ID:', messageData._id);
      }
    }
  }

  ngOnDestroy() {
    // Leave ride room when closing chat
    if (this.currentRide?._id) {
      console.log('🚪 [DriverChatPage] Leaving ride room...');
      this.rideService.leaveRideRoom(this.currentRide._id).catch(error => {
        console.error('❌ [DriverChatPage] Error leaving room:', error);
      });
    }
    
    this.messageSubscription?.unsubscribe();
    this.messagesSubscription?.unsubscribe();
    this.messageSentSubscription?.unsubscribe();
  }

  private formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private addMessage(message: ChatMessage) {
    console.log('➕ [DriverChatPage] addMessage() called');
    console.log('   Message ID:', message._id || 'temporary');
    console.log('   Message text:', message.text.substring(0, 50) + (message.text.length > 50 ? '...' : ''));
    console.log('   Message sender:', message.sender);
    console.log('   Current messages count:', this.messageIds.size);
    
    // Prevent duplicates
    if (message._id && this.messageIds.has(message._id)) {
      console.warn('⚠️ [DriverChatPage] Duplicate message detected, skipping:', message._id);
      return;
    }

    // Add to tracked IDs
    if (message._id) {
      this.messageIds.add(message._id);
      console.log('✅ [DriverChatPage] Message ID added to tracking set');
    } else {
      console.log('ℹ️ [DriverChatPage] Message has no ID (optimistic update)');
    }

    // Add message and sort by timestamp
    const beforeCount = this.messages.length;
    this.messages.push(message);
    console.log('📝 [DriverChatPage] Message added to array (before:', beforeCount, 'after:', this.messages.length + ')');
    
    this.messages.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });
    console.log('🔄 [DriverChatPage] Messages sorted by timestamp');
    
    // Force UI update
    this.cdr.detectChanges();

    // Force scroll when new message is added
    setTimeout(() => {
      console.log('📜 [DriverChatPage] Triggering scroll to bottom');
      this.scrollToBottom(true);
    }, 200);
  }

  ngAfterViewChecked() {
    // Only auto-scroll if messages are loading or if we're at the bottom
    // This prevents annoying scroll behavior when user is reading old messages
    if (this.isLoadingMessages) {
      this.scrollToBottom(true);
    }
  }

  scrollToBottom(force: boolean = false): void {
    console.log('📜 [DriverChatPage] scrollToBottom() called');
    console.log('   Force scroll:', force);
    
    try {
      if (!this.messageContainer?.nativeElement) {
        console.warn('⚠️ [DriverChatPage] messageContainer not available');
        return;
      }
      
      const container = this.messageContainer.nativeElement;
      
      // Use requestAnimationFrame for better timing
      requestAnimationFrame(() => {
        try {
          const scrollHeight = container.scrollHeight;
          const clientHeight = container.clientHeight;
          const scrollTop = container.scrollTop;
          const maxScroll = scrollHeight - clientHeight;
          
          console.log('📊 [DriverChatPage] Scroll metrics:');
          console.log('   Scroll height:', scrollHeight);
          console.log('   Client height:', clientHeight);
          console.log('   Scroll top:', scrollTop);
          console.log('   Max scroll:', maxScroll);
          console.log('   Distance from bottom:', scrollHeight - scrollTop - clientHeight);
          
          // Only scroll if user is near bottom (within 100px) or force is true
          const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
          console.log('   Is near bottom:', isNearBottom);
          
          if (force || isNearBottom) {
            console.log('✅ [DriverChatPage] Scrolling to bottom...');
            // Use multiple attempts with delays for DOM updates
            setTimeout(() => {
              if (container) {
                container.scrollTop = container.scrollHeight;
                console.log('✅ [DriverChatPage] First scroll attempt');
                
                // Second attempt after a delay
                setTimeout(() => {
                  if (container) {
                    container.scrollTop = container.scrollHeight;
                    console.log('✅ [DriverChatPage] Second scroll attempt');
                  }
                }, 100);
              }
            }, 50);
            
            // Fallback: Use scrollIntoView on last message element
            setTimeout(() => {
              const messages = container.querySelectorAll('.message');
              if (messages.length > 0) {
                const lastMessage = messages[messages.length - 1] as HTMLElement;
                lastMessage.scrollIntoView({ behavior: 'smooth', block: 'end' });
                console.log('✅ [DriverChatPage] Used scrollIntoView fallback');
              }
            }, 300);
          } else {
            console.log('⏸️ [DriverChatPage] User scrolled up, not auto-scrolling');
          }
        } catch (err) {
          console.error('❌ [DriverChatPage] Error in scroll animation:', err);
        }
      });
    } catch (err) {
      console.error('❌ [DriverChatPage] Error scrolling to bottom:', err);
      console.error('   Error details:', err);
    }
  }

  async sendMessage() {
    console.log('💬 ========================================');
    console.log('💬 [DriverChatPage] sendMessage() called');
    console.log('💬 ========================================');
    console.log('📝 New message text:', this.newMessage);
    console.log('📝 Trimmed length:', this.newMessage.trim().length);
    console.log('🚗 Current ride:', this.currentRide ? { id: this.currentRide._id, driver: this.currentRide.driver?._id } : 'null');
    
    if (!this.newMessage.trim()) {
      console.warn('⚠️ [DriverChatPage] Message is empty, cannot send');
      console.log('========================================');
      return;
    }

    if (!this.currentRide) {
      console.error('❌ [DriverChatPage] No current ride, cannot send message');
      console.log('========================================');
      return;
    }

    const messageText = this.newMessage.trim();
    const now = new Date();
    const time = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    console.log('⏰ Message timestamp:', time);
    console.log('📅 Message ISO timestamp:', now.toISOString());

    // Create optimistic message (without ID, will be updated when confirmed)
    const optimisticMessage: ChatMessage = {
      text: messageText,
      time: time,
      sender: 'user',
      createdAt: now.toISOString(),
    };

    console.log('✨ [DriverChatPage] Created optimistic message:', optimisticMessage);

    // Add message to UI immediately (optimistic update)
    console.log('📋 [DriverChatPage] Adding optimistic message to UI...');
    this.addMessage(optimisticMessage);
    console.log('✅ [DriverChatPage] Optimistic message added to UI');
    console.log('📊 [DriverChatPage] Total messages in UI:', this.messages.length);

      // Send via Socket.IO for real-time delivery
      console.log('📡 [DriverChatPage] Sending message via Socket.IO...');
      try {
        await this.rideService.sendMessage(messageText);
        console.log('✅ [DriverChatPage] Socket.IO sendMessage() completed');
      } catch (error) {
        console.error('❌ [DriverChatPage] Error calling socket sendMessage:', error);
        console.error('   Error type:', error?.constructor?.name);
        console.error('   Error message:', error instanceof Error ? error.message : String(error));
      }

    // Also send via REST API for persistence
    console.log('🌐 [DriverChatPage] Sending message via REST API...');
    try {
      const sentMessage = await this.rideService.sendMessageViaAPI(messageText);
      console.log('✅ [DriverChatPage] Message sent via API successfully');
      console.log('📦 [DriverChatPage] API response:', sentMessage);
      
      // Update optimistic message with actual message data if available
      if (sentMessage && sentMessage._id) {
        console.log('🔄 [DriverChatPage] Updating optimistic message with server data...');
        console.log('   Server message ID:', sentMessage._id);
        this.updateMessageWithId(sentMessage);
        console.log('✅ [DriverChatPage] Optimistic message updated');
        // Scroll after updating message
        setTimeout(() => this.scrollToBottom(true), 100);
      } else {
        console.warn('⚠️ [DriverChatPage] API response missing _id, cannot update optimistic message');
      }
    } catch (error) {
      console.error('❌ [DriverChatPage] Error sending message via API:', error);
      console.error('   Error type:', error?.constructor?.name);
      console.error('   Error message:', error instanceof Error ? error.message : String(error));
      // Message was still sent via socket, so don't remove from UI
    }

    this.newMessage = '';
    console.log('✅ [DriverChatPage] sendMessage() completed');
    console.log('========================================');
  }

  openImagePicker() {
    // In a real app, implement image picker functionality
    console.log('Opening image picker...');
  }

  openImage(imageUrl: string) {
    // In a real app, implement image preview functionality
    console.log('Opening image:', imageUrl);
  }

  async dismiss() {
    await this.modalController.dismiss();
  }

  goBack() {
    this.dismiss();
  }

  trackByMessageId(index: number, message: ChatMessage): string {
    return message._id || index.toString();
  }
}
