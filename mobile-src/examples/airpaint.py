import cv2
import numpy as np
import mediapipe as mp

camera = cv2.VideoCapture(0)
hands = mp.solutions.hands.Hands(max_num_hands=2)
canvas = None
previous = {}
while True:
    ok, frame = camera.read()
    if not ok:
        break
    frame = cv2.flip(frame, 1)
    if canvas is None:
        canvas = np.zeros_like(frame)
    result = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    active = {}
    for index, hand in enumerate(result.multi_hand_landmarks or []):
        h, w = frame.shape[:2]
        point = (int(hand.landmark[8].x*w), int(hand.landmark[8].y*h))
        color = (255, 200, 40) if index == 0 else (160, 70, 255)
        if index in previous:
            cv2.line(canvas, previous[index], point, color, 6)
        cv2.circle(frame, point, 10, color, -1)
        active[index] = point
    previous = active
    output = cv2.addWeighted(frame, 0.7, canvas, 1.0, 0)
    cv2.putText(output, 'AIR PAINT | index finger draws | q exits', (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (240, 255, 240), 1)
    cv2.imshow('AirPaint', output)
    if cv2.waitKey(1) & 0xff == ord('q'):
        break
camera.release()
hands.close()
cv2.destroyAllWindows()
