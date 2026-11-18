"""CodePad camera studio: actual MediaPipe landmarks, up to two hands.
Keys: Q/Escape close; 1 front camera; 2 back camera.
Camera permission and model initialization can take a moment on first use.
"""
import time
import cv2
import mediapipe as mp

LINKS = ((0,1),(1,2),(2,3),(3,4),(0,5),(5,6),(6,7),(7,8),
         (5,9),(9,10),(10,11),(11,12),(9,13),(13,14),(14,15),
         (15,16),(13,17),(0,17),(17,18),(18,19),(19,20))

def camera(index):
    capture = cv2.VideoCapture(index)
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, 960)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 540)
    if not capture.isOpened():
        capture.release()
        raise RuntimeError("Camera unavailable. Check Android camera permission.")
    return capture

cap = camera(0)
last = time.perf_counter()
fps = 0.0
try:
    with mp.solutions.hands.Hands(max_num_hands=2,
            min_detection_confidence=0.8, min_tracking_confidence=0.8) as hands:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frame = cv2.flip(frame, 1)
            height, width = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb.flags.writeable = False
            result = hands.process(rgb)
            detected = result.multi_hand_landmarks or []
            for index, hand in enumerate(detected):
                color = (255, 205, 90) if index == 0 else (160, 140, 255)
                points = [(max(0,min(width-1,int(p.x*width))),
                           max(0,min(height-1,int(p.y*height)))) for p in hand.landmark]
                for a,b in LINKS:
                    cv2.line(frame, points[a], points[b], color, 2, cv2.LINE_AA)
                for i, point in enumerate(points):
                    cv2.circle(frame, point, 6 if i in (4,8,12,16,20) else 3, color, -1)
            now = time.perf_counter()
            fps = 0.9*fps + 0.1/max(now-last, 0.001)
            last = now
            cv2.rectangle(frame, (0,0), (width,62), (38,30,22), -1)
            cv2.putText(frame, "CODEPAD CAMERA STUDIO", (18,25),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255,236,210), 2)
            text = "Hands: %d | %.1f FPS | 1:Front  2:Back  Q:Close" % (len(detected),fps)
            cv2.putText(frame, text, (18,49), cv2.FONT_HERSHEY_SIMPLEX,
                        0.44, (215,198,178), 1)
            cv2.imshow("Camera Studio", frame)
            key = cv2.waitKey(1) & 255
            if key in (ord('q'),27):
                break
            if key in (ord('1'),ord('2')):
                cap.release()
                cap = camera(0 if key == ord('1') else 1)
finally:
    cap.release()
    cv2.destroyAllWindows()
