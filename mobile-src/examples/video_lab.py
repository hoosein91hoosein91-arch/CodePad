"""Video Lab: put clip.webm (or change VIDEO) beside main.py in your project.
Keys: 1=original, 2=edges, 3=HSV mask, Q/Escape=exit. S saves PNG.
CodePad samples local video at 30 FPS by default (not source container FPS).
"""
import cv2
import numpy as np

VIDEO = 'clip.webm'
cap = cv2.VideoCapture(VIDEO)
if not cap.isOpened():
    raise RuntimeError('Could not decode video: ' + cap.last_error)
mode = '1'
try:
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame.shape[1] > 640:
            frame = cv2.resize(frame, (640, round(frame.shape[0]*640/frame.shape[1])))
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if mode == '2':
            display = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 70, 140)
        elif mode == '3':
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            display = cv2.inRange(hsv, np.array([35, 45, 45]), np.array([90, 255, 255]))
            display = cv2.morphologyEx(display, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        else:
            display = frame
        cv2.imshow('Video Lab | 1 Original  2 Edges  3 Mask', display)
        key = cv2.waitKey(1) & 255
        if key in (27, ord('q')):
            break
        if key in (ord('1'), ord('2'), ord('3')):
            mode = chr(key)
        elif key == ord('s'):
            cv2.imwrite('video-frame.png', display)
finally:
    cap.release()
    cv2.destroyAllWindows()
