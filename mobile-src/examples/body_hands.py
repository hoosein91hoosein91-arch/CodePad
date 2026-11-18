"""CodePad 3.6.3: real hand + body landmarks, all inference on the device.
Press Q to exit. Keep your shoulders and hands visible in good lighting.
"""
import cv2
import mediapipe as mp
from codepad_tracking import Tracker

cap = cv2.VideoCapture(0)
cap.set(3, 640)
cap.set(4, 480)
try:
    with Tracker(hands=2, body=True, smooth=True) as tracker:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break
            frame = cv2.flip(frame, 1)
            result = tracker.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            if result.body:
                mp.solutions.drawing_utils.draw_landmarks(frame, result.body, mp.solutions.pose.POSE_CONNECTIONS)
            for hand in result.hands:
                mp.solutions.drawing_utils.draw_landmarks(frame, hand, mp.solutions.hands.HAND_CONNECTIONS)
                p = hand.landmark[0]
                x, y = int(p.x * frame.shape[1]), int(p.y * frame.shape[0])
                cv2.putText(frame, 'Hand ' + str(hand.id), (x, y), cv2.FONT_HERSHEY_SIMPLEX, .55, (0, 255, 255), 1)
            cv2.putText(frame, 'BODY + HANDS | Q: EXIT', (12, 28), cv2.FONT_HERSHEY_SIMPLEX, .6, (255, 255, 255), 1)
            cv2.imshow('Body and Hands', frame)
            if cv2.waitKey(1) & 255 in (ord('q'), 27):
                break
finally:
    cap.release()
    cv2.destroyAllWindows()
