import cv2
import numpy as np
import mediapipe as mp
from datetime import datetime
from pathlib import Path

# Hand tracking
mp_hands = mp.solutions.hands

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

if not cap.isOpened():
    raise RuntimeError("Camera not found. Check webcam access.")

canvas = None
previous_point = None

# BGR colors
colors = {
    ord("1"): (255, 255, 0),  # Cyan
    ord("2"): (255, 0, 255),  # Pink
    ord("3"): (0, 255, 0),    # Green
}

draw_color = colors[ord("1")]
brush_size = 10
eraser_size = 50

try:
    with mp_hands.Hands(
        max_num_hands=1,
        min_detection_confidence=0.7,
        min_tracking_confidence=0.7
    ) as hands:

        while True:
            success, frame = cap.read()

            if not success:
                print("Could not read camera.")
                break

            frame = cv2.flip(frame, 1)
            height, width = frame.shape[:2]

            if canvas is None or canvas.shape != frame.shape:
                canvas = np.zeros_like(frame)
                previous_point = None

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb.flags.writeable = False
            results = hands.process(rgb)

            if results.multi_hand_landmarks:
                hand = results.multi_hand_landmarks[0]
                landmarks = hand.landmark

                def get_point(index):
                    x = int(landmarks[index].x * width)
                    y = int(landmarks[index].y * height)
                    return (
                        max(0, min(width - 1, x)),
                        max(0, min(height - 1, y))
                    )

                index_point = get_point(8)
                pinky_point = get_point(20)

                index_up = landmarks[8].y < landmarks[6].y
                pinky_up = landmarks[20].y < landmarks[18].y

                # Eraser mode
                if pinky_up:
                    previous_point = None

                    cv2.circle(
                        canvas,
                        pinky_point,
                        eraser_size,
                        (0, 0, 0),
                        -1
                    )

                    cv2.circle(
                        frame,
                        pinky_point,
                        eraser_size,
                        (0, 0, 255),
                        2
                    )

                # Drawing mode
                elif index_up:
                    cv2.circle(
                        frame,
                        index_point,
                        9,
                        draw_color,
                        -1
                    )

                    if previous_point is None:
                        cv2.circle(
                            canvas,
                            index_point,
                            brush_size // 2,
                            draw_color,
                            -1
                        )
                    else:
                        cv2.line(
                            canvas,
                            previous_point,
                            index_point,
                            draw_color,
                            brush_size,
                            cv2.LINE_AA
                        )

                    previous_point = index_point

                else:
                    previous_point = None

            else:
                previous_point = None

            # Combine camera and canvas
            gray = cv2.cvtColor(
                canvas, cv2.COLOR_BGR2GRAY
            )

            _, mask = cv2.threshold(
                gray, 10, 255, cv2.THRESH_BINARY
            )

            background = cv2.bitwise_and(
                frame,
                frame,
                mask=cv2.bitwise_not(mask)
            )

            foreground = cv2.bitwise_and(
                canvas,
                canvas,
                mask=mask
            )

            display = cv2.add(background, foreground)

            # Top toolbar
            overlay = display.copy()

            cv2.rectangle(
                overlay,
                (0, 0),
                (width, 65),
                (20, 25, 35),
                -1
            )

            display = cv2.addWeighted(
                overlay, 0.85, display, 0.15, 0
            )

            cv2.putText(
                display,
                "AIR PAINT",
                (20, 27),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (255, 255, 255),
                2
            )

            cv2.putText(
                display,
                "1:Cyan  2:Pink  3:Green  C:Clear  S:Save  Q:Quit",
                (20, 52),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.52,
                (190, 215, 235),
                1
            )

            cv2.imshow("Air Paint Studio", display)

            key = cv2.waitKey(1) & 0xFF

            if key in (ord("q"), 27):
                break

            elif key == ord("c"):
                canvas[:] = 0
                previous_point = None

            elif key == ord("s"):
                filename = (
                    "painting_"
                    + datetime.now().strftime("%Y%m%d_%H%M%S")
                    + ".png"
                )

                output = Path(__file__).resolve().parent / filename

                if cv2.imwrite(str(output), canvas):
                    print("Saved:", output)
                else:
                    print("Failed to save image.")

            elif key in colors:
                draw_color = colors[key]
                previous_point = None

finally:
    cap.release()
    cv2.destroyAllWindows()
